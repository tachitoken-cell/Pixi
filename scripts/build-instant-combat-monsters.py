"""Original Bone Pit / Void Rift combatants, authored in Blender from mesh geometry.

Blender --background --disable-autoexec --threads 4 --python scripts/build-instant-combat-monsters.py -- --render
No source creature meshes are reused. Palette follows the two supplied arena scenes.
"""
import bpy, math, json, sys, struct
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'assets/source/instant-combat'
OUT=ROOT/'public/models/instant-combat-monsters.glb'
DEST.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene.render.fps=30;scene.frame_start=0;scene.frame_end=60
COLORS={'bone':(.823,.738,.552,1),'old':(.644,.521,.314,1),'shade':(.36,.25,.13,1),
 'rust':(.144,.030,.009,1),'iron':(.045,.040,.039,1),'edge':(.22,.18,.14,1),'red':(.254,.010,.007,1),
 'dark':(.005,.003,.008,1),'void':(.033,.018,.069,1),'plate':(.075,.044,.125,1),'lavender':(.28,.14,.45,1),
 'purple':(.434,.162,1,1),'pink':(1,.030,.527,1),'fire':(1,.30,.035,1),'mint':(.16,.75,.16,1),
 'white':(.791,.578,1,1),'gold':(.48,.27,.075,1)}
GLOW={'purple','pink','fire','mint','white'}
parts={};pivots={};roots={};rigs={};stats={};active='';current='body'

def material(name,glow=False):
 m=bpy.data.materials.new(name);m.use_nodes=True
 shader=m.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.67;shader.inputs['Metallic'].default_value=.22
 color=m.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='CombatTint';m.node_tree.links.new(color.outputs['Color'],shader.inputs['Base Color'])
 if glow:m.node_tree.links.new(color.outputs['Color'],shader.inputs['Emission Color']);shader.inputs['Emission Strength'].default_value=1.6
 return m
palette=material('Instant Combat modeled palette');glow=material('Instant Combat emissive details',True)

def part(label,pivot):
 global current
 current=label;parts.setdefault(label,[]);pivots[label]=Vector(pivot)
def mesh(v,f,color):
 # Both shared materials are double-sided; duplicate reversed cloth faces would
 # be invalid Blender topology and add coplanar triangles to the runtime asset.
 seen=set();faces=[]
 for face in f:
  key=tuple(sorted(face))
  if key not in seen:seen.add(key);faces.append(face)
 parts[current].append(([Vector(p) for p in v],faces,color))
def box(c,s,color,cut=.16):
 x,y,z=c;w,d,h=s;cut=min(s)*cut
 p=[(-w/2+cut,-h/2),(w/2-cut,-h/2),(w/2,-h/2+cut),(w/2,h/2-cut),(w/2-cut,h/2),(-w/2+cut,h/2),(-w/2,h/2-cut),(-w/2,-h/2+cut)]
 mesh([(x+a,y+b,z+c) for b in [-d/2,d/2] for a,c in p],[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)],color)
def tube(points,radii,color,n=6):
 points=[Vector(p) for p in points];v=[];f=[]
 for i,p in enumerate(points):
  axis=(points[min(i+1,len(points)-1)]-points[max(i-1,0)]).normalized();u=axis.cross(Vector((0,1,0)))
  if u.length<.01:u=axis.cross(Vector((1,0,0)))
  u.normalize();w=axis.cross(u);r=radii[i] if isinstance(radii,list) else radii
  v.extend(p+r*(math.cos(j*math.tau/n)*u+math.sin(j*math.tau/n)*w) for j in range(n))
 for i in range(len(points)-1):
  for j in range(n):f.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
 f += [tuple(reversed(range(n))),tuple((len(points)-1)*n+j for j in range(n))];mesh(v,f,color)
def rune(c,size,color):
 x,y,z=c
 tube([(x,y,z-size),(x,y,z+size)],size*.07,color,4)
 tube([(x-size*.65,y,z+size*.5),(x+size*.55,y,z),(x-size*.55,y,z-size*.5)],size*.07,color,4)












def voxel(c,r,color,detail=8):
 # Same greedy exterior voxel construction used by build-autumn-pet-assets.py.
 dims=[max(2,round(radius/max(r)*detail)) for radius in r]
 cells={(x,y,z) for x in range(dims[0]) for y in range(dims[1]) for z in range(dims[2]) if sum(((v+.5)*2/n-1)**2 for v,n in zip((x,y,z),dims))<=1}
 vertices=[];faces=[]
 for axis in range(3):
  u=(axis+1)%3;v=(axis+2)%3
  for direction in [-1,1]:
   for layer in range(dims[axis]):
    mask=set()
    for cell in cells:
     if cell[axis]!=layer:continue
     neighbor=list(cell);neighbor[axis]+=direction
     if tuple(neighbor) not in cells:mask.add((cell[u],cell[v]))
    while mask:
     x,y=min(mask,key=lambda p:(p[1],p[0]));w=1;h=1
     while (x+w,y) in mask:w+=1
     while all((x+i,y+h) in mask for i in range(w)):h+=1
     mask.difference_update((x+i,y+j) for i in range(w) for j in range(h));offset=len(vertices)
     for a,b in [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]:
      p=[0,0,0];p[axis]=layer+(direction>0);p[u]=a;p[v]=b;vertices.append(tuple(c[j]+(p[j]*2/dims[j]-1)*r[j] for j in range(3)))
     faces.append(tuple(offset+i for i in ([0,1,2,3] if direction>0 else [3,2,1,0])))
 mesh(vertices,faces,color)
def pixel_eye(c,size=.10,iris='fire'):
 x,y,z=c
 for color,dy,w,h in [('dark',0,2.3,2.25),('bone',-.018,1.96,1.98),(iris,-.035,1.66,1.70),('dark',-.05,.76,1.23)]:box((x,y+dy,z),(size*w,.025,size*h),color,.16)
 box((x-size*.24,y-.067,z+size*.30),(size*.32,.012,size*.36),'bone',.04)
def stepped(points,radii,color,steps=7):
 points=[Vector(p) for p in points]
 for j in range(len(points)-1):
  a,b=points[j:j+2]
  for k in range(steps):
   t=(k+.5)/steps;p=a.lerp(b,t);r=radii[j]*(1-t)+radii[j+1]*t
   box(p,(r*2,r*2,max(r*1.5,(b-a).length/steps*1.25)),color,.08)
def pixel_leaf(a,b,width,color):
 a,b=Vector(a),Vector(b);d=b-a;side=d.cross(Vector((0,1,0))).normalized()*width/2;normal=side.cross(d).normalized()*.025
 for i,profile in enumerate([.42,.72,1,.88,.58,.28]):
  c=a+d*(i+.5)/6;v=[c+side*x*profile+d*y/12+normal*z for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
  mesh(v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],color)
def pixel_skull(c,size=1):
 x,y,z=c
 voxel((x,y,z+.04*size),(.33*size,.25*size,.30*size),'bone',10)
 voxel((x,y-.10*size,z-.16*size),(.25*size,.20*size,.15*size),'old',8)
 for s in [-1,1]:
  pixel_eye((x+s*.155*size,y-.251*size,z+.063*size),.106*size,'fire')
  box((x+s*.18*size,y-.28*size,z+.20*size),(.24*size,.07*size,.065*size),'old')
  for j in range(2):box((x+s*(.25+j*.03)*size,y-.20*size,z-.03*size),(.09*size,.10*size,.07*size),'bone')
 box((x,y-.30*size,z-.095*size),(.09*size,.025*size,.09*size),'dark')
 box((x,y-.302*size,z-.025*size),(.037*size,.025*size,.10*size),'dark')
 box((x,y-.279*size,z-.22*size),(.37*size,.04*size,.09*size),'dark')
 for j in range(5):box((x+(j-2)*.067*size,y-.305*size,z-.196*size),(.047*size,.05*size,.057*size),'bone',.02)
def voxel_tyrant():
 part('body',(0,0,1.16));voxel((0,.015,1.19),(.54,.36,.51),'iron',10)
 for s in [-1,1]:
  for j in range(4):
   z=1.10+j*.13;box((s*.25,-.34,z),(.38,.11,.085),'bone');box((s*.46,-.23,z+.02),(.105,.22,.09),'old')
  voxel((s*.65,.02,1.63),(.34,.33,.24),'iron',8)
  for j in range(3):box((s*.65,-.15+j*.16,1.79),(.57,.125,.095),'old' if j==1 else 'bone')
  pixel_skull((s*.66,-.295,1.65),.48)
  for j in range(3):stepped([(s*(.51+j*.12),.11,1.76),(s*(.60+j*.14),.12,1.97+j*.055)],[.08,.012],'bone',4)
  for j in range(4):box((s*(.12+j*.095),-.21,.62),(.083,.13,.42-(j%2)*.07),'red')
  for row in range(4):
   for col in range(3):box((s*(.36+col*.036),-.245,.91-row*.043),(.028,.026,.030),'edge',.20)
 box((0,-.36,1.07),(.95,.105,.15),'gold');box((0,-.423,1.07),(.22,.04,.20),'iron');rune((0,-.45,1.07),.065,'fire')
 part('head',(0,0,1.72));pixel_skull((0,-.015,2.0),1.03)
 for j in range(5):
  x=(j-2)*.13;h=.22+(.06 if j%2==0 else 0);box((x,-.04,2.26+h/2),(.085,.14,h),'gold');box((x,-.12,2.29+h*.52),(.035,.024,.07),'fire')
 box((0,-.19,2.27),(.67,.09,.095),'gold')
 for s in [-1,1]:
  part('left-leg' if s<0 else 'right-leg',(s*.29,0,.82));box((s*.29,0,.56),(.33,.35,.52),'old')
  voxel((s*.29,-.055,.30),(.24,.25,.25),'iron',6);box((s*.29,-.16,.53),(.39,.095,.21),'iron');box((s*.29,-.215,.53),(.26,.04,.13),'gold')
  voxel((s*.29,-.10,.13),(.26,.34,.135),'iron',6)
  for j in range(3):box((s*.29+(j-1)*.13,-.39,.10),(.11,.09,.11),'bone')
 part('right-arm',(0,0,1.56))
 for s,hand in [(-1,(.69,-.49,1.07)),(1,(.69,-.49,1.29))]:
  elbow=Vector((s*.72,-.06,1.23));stepped([(s*.59,0,1.58),elbow,hand],[.14,.135,.115],'old',4)
  box(elbow,(.33,.30,.31),'iron');voxel(hand,(.155,.15,.135),'bone',6)
  for j in range(3):box((hand[0]+(j-1)*.082,hand[1]-.125,hand[2]),(.066,.05,.17),'old')
 box((.69,-.49,1.25),(.095,.095,.85),'shade')
 for j in range(7):box((.69,-.49,.97+j*.086),(.13,.12,.035),'gold')
 box((.69,-.49,1.58),(.57,.18,.11),'gold')
 box((.81,-.49,2.00),(.43,.17,.81),'iron',.13);box((1.04,-.50,2.00),(.045,.19,.80),'bone')
 box((.80,-.49,2.43),(.44,.18,.08),'edge');rune((.81,-.586,2.06),.16,'fire')
 for j in range(5):box((.65,-.59,1.77+j*.13),(.031,.017,.031),'gold')

def voxel_sovereign():
 part('body',(0,0,1.24));voxel((0,.04,1.38),(.53,.34,.46),'void',10)
 for j in range(5):
  z=1.10+j*.125;box((0,-.29,z),(.73+(j%2)*.08,.12,.075),'lavender');box((0,-.365,z),(.28,.065,.042),'purple')
 for s in [-1,1]:
  for j in range(4):
   x=s*(.11+j*.13);pixel_leaf((x,.10,1.27),(x+s*.06,-.08,.16+j*.045),.24,'void' if j%2 else 'plate')
   box((x,-.105,.69+j*.05),(.032,.032,.70-j*.06),'lavender')
   for k in range(3):box((x,-.13,.27+j*.05+k*.055),(.073,.020,.017),'purple' if k==1 else 'lavender')
  voxel((s*.61,.015,1.64),(.32,.29,.23),'plate',8)
  box((s*.61,-.274,1.66),(.39,.04,.22),'void');box((s*.61,-.301,1.66),(.30,.025,.13),'plate')
  for sx in [-1,1]:
   for sz in [-1,1]:box((s*.61+sx*.165,-.305,1.66+sz*.075),(.029,.014,.029),'lavender')
  rune((s*.61,-.323,1.66),.042,'purple')
  for j in range(4):pixel_leaf((s*(.43+j*.09),.025,1.74),(s*(.62+j*.14),.015,2.07+j*.025),.16,'lavender' if j%2 else 'void')
 part('head',(0,0,1.77));voxel((0,0,2.0),(.34,.25,.34),'lavender',10)
 box((0,-.249,1.87),(.26,.065,.23),'plate')
 for s in [-1,1]:
  pixel_eye((s*.153,-.26,2.035),.109,'pink');box((s*.15,-.275,2.20),(.27,.06,.06),'void')
  for j in range(3):
   p=[(s*(.18+j*.045),.025,2.22),(s*(.31+j*.08),.04,2.42),(s*(.28+j*.085),.04,2.68-j*.035)]
   stepped(p,[.078,.065,.009],'void',5)
   for k in range(4):box((s*(.30+j*.08),.01,2.43+k*.043),(.115-k*.01,.13-k*.01,.018),'lavender')
 box((0,-.30,1.80),(.16,.04,.04),'purple')
 for s in [-1,1]:
  part('left-arm' if s<0 else 'right-arm',(s*.55,0,1.63));stepped([(s*.55,0,1.63),(s*.74,-.04,1.24),(s*.76,-.20,1.03)],[.145,.125,.14],'plate',5)
  for j in range(3):box((s*.75,-.21,1.26-j*.09),(.29,.13,.065),'lavender')
  box((s*.75,-.289,1.18),(.17,.020,.15),'void');rune((s*.75,-.307,1.18),.047,'purple')
  voxel((s*.77,-.20,1.03),(.17,.15,.16),'void',6)
  for j in range(4):stepped([(s*.77+(j-1.5)*.075,-.24,1.0),(s*.77+(j-1.5)*.08,-.29,.82),(s*.77+(j-1.5)*.08,-.34,.79)],[.036,.024,.006],'lavender',3)
 part('orbit',(0,0,1.51))
 for j in range(7):a=j*math.tau/7;voxel((math.sin(a)*1.0,math.cos(a)*.62,1.57+math.cos(a)*.12),(.09,.08,.16),'lavender',5);box((math.sin(a)*1.0,math.cos(a)*.62-.075,1.57+math.cos(a)*.12),(.035,.02,.10),'purple')

def voxel_colossus():
 part('body',(0,0,1.23));voxel((0,.04,1.32),(.69,.43,.58),'old',12)
 box((0,-.39,1.30),(1.0,.08,.83),'iron')
 for s in [-1,1]:
  for j in range(5):box((s*.27,-.46,1.10+j*.135),(.44,.14,.09),'bone');box((s*.52,-.35,1.10+j*.135),(.13,.22,.10),'bone')
  voxel((s*.76,.02,1.65),(.30,.35,.31),'bone',8)
  for j in range(3):stepped([(s*(.53+j*.16),.12,1.85),(s*(.63+j*.19),.12,2.08+j*.08)],[.10,.03],'old',4)
  part('left-leg' if s<0 else 'right-leg',(s*.37,0,.85));voxel((s*.38,0,.51),(.24,.25,.39),'old',8)
  box((s*.38,-.22,.62),(.41,.15,.26),'iron');box((s*.38,-.31,.62),(.28,.045,.13),'bone')
  voxel((s*.40,-.09,.16),(.30,.36,.16),'bone',8)
  for j in range(4):box((s*.4+(j-1.5)*.116,-.39,.12),(.095,.14,.15),'old')
  part('left-arm' if s<0 else 'right-arm',(s*.76,.0,1.60));stepped([(s*.77,0,1.60),(s*.98,-.025,1.09),(s*1.01,-.10,.53)],[.21,.23,.25],'old',5)
  voxel((s*1.01,-.11,.54),(.33,.30,.30),'iron',8)
  for j in range(4):box((s*1.01+(j-1.5)*.135,-.39,.53),(.105,.13,.35),'bone')
  for j in range(3):box((s*1.01,-.40,.67+j*.09),(.65,.065,.040),'edge')
  for j in range(4):box((s*1.01+(j-1.5)*.145,-.10,.83),(.12,.31,.13),'bone')
 part('head',(0,-.18,1.85));pixel_skull((0,-.21,2.05),1.28)
 for s in [-1,1]:
  stepped([(s*.28,-.46,1.80),(s*.43,-.55,1.89),(s*.43,-.55,2.18)],[.11,.10,.025],'old',6)
  stepped([(s*.26,-.14,2.22),(s*.40,-.05,2.40),(s*.53,.02,2.48)],[.12,.09,.03],'bone',5)
 part('body',(0,0,1.23));box((0,-.49,1.42),(.17,.10,.59),'old');box((0,-.555,1.50),(.10,.027,.15),'fire')

def voxel_priest(void=False):
 base='plate' if void else 'iron';trim='lavender' if void else 'old';light='purple' if void else 'fire'
 part('body',(0,0,1.1));voxel((0,.02,1.32),(.40,.31,.45),base,10)
 for side in [-1,1]:
  for j in range(4):
   x=side*(.08+j*.10);pixel_leaf((x,.05,1.15),(x+side*.05,-.02,.025+j*.025),.22,base if j%2 else ('void' if void else 'red'))
   box((x,-.175,.57+j*.035),(.028,.025,.72-j*.05),trim)
  for j in range(4):box((side*.18,-.28,1.20+j*.125),(.28,.08,.065),trim)
  voxel((side*.47,.0,1.56),(.24,.27,.19),base,8)
  for j in range(3):pixel_leaf((side*(.37+j*.08),.04,1.66),(side*(.50+j*.11),.08,1.92+j*.045),.13,trim)
  part('left-arm' if side<0 else 'right-arm',(side*.45,0,1.55));stepped([(side*.46,0,1.54),(side*.60,-.02,1.22),(side*.67,-.16,1.29)],[.13,.13,.10],trim,5)
  pixel_leaf((side*.51,.10,1.49),(side*.68,.08,.80),.32,base);voxel((side*.67,-.16,1.29),(.13,.11,.11),trim,6)
  for j in range(3):box((side*.67+(j-1)*.065,-.26,1.29),(.045,.065,.14),'bone' if not void else 'lavender')
  if side==1:
   box((.69,-.15,1.11),(.064,.066,2.1),'shade' if not void else 'void')
   for j in range(15):a=j*math.tau/15;box((.69+math.sin(a)*.20,-.15,2.26+math.cos(a)*.23),(.065,.08,.065),trim)
   voxel((.69,-.15,2.26),(.09,.065,.12),light,6)
 part('head',(0,0,1.69))
 if void:
  voxel((0,0,1.94),(.29,.22,.28),'lavender',10)
  for side in [-1,1]:pixel_eye((side*.135,-.221,1.98),.093,'purple');stepped([(side*.19,.05,2.11),(side*.30,.08,2.35),(side*.22,.06,2.54)],[.075,.060,.025],'void',5)
  box((0,-.25,1.82),(.11,.026,.035),'dark')
 else:
  pixel_skull((0,-.015,1.94),.98);voxel((0,.05,2.23),(.25,.17,.18),'red',8)
  for j in range(3):box((0,-.135,2.26+j*.068),(.30-j*.075,.045,.065),'gold')
 part('halo',(0,.20,1.92))
 if not void:
  for j in range(22):
   a=j*math.tau/22;box((math.sin(a)*.66,.19,1.99+math.cos(a)*.71),(.085,.065,.085),'old')
   if j%2==0:pixel_leaf((math.sin(a)*.65,.19,1.99+math.cos(a)*.7),(math.sin(a)*.83,.20,1.99+math.cos(a)*.88),.10,'bone')
 else:voxel((0,.04,.45),(.12,.12,.28),'purple',6)

def voxel_insect(void=False,small=False):
 base='void' if void else 'shade';shell='plate' if void else 'bone';trim='lavender' if void else 'old';light='pink' if void else 'mint' if small else 'fire'
 width=.50 if small else .74;depth=.62 if small else .89;height=.92 if small else 1.20
 part('body',(0,.13,height));voxel((0,.28,height),(width,depth,.43 if small else .57),base,12)
 for row in range(6):
  y=-.28+row*(.18 if small else .25);w=width*(.77+math.sin((row+.5)/6*math.pi)*.23)
  box((0,y,height+.36),(w*1.4,.17,.13),shell)
  for side in [-1,1]:
   box((side*w*.67,y,height+.26),(.22,.18,.22),shell);box((side*w*.88,y,height+.08),(.16,.18,.22),trim)
   if row%2==0:box((side*w*.70,y-.10,height+.28),(.035,.025,.10),light)
  if not small:voxel((0,y,height+.52),(.085,.10,.16),trim,5)
 for side in [-1,1]:
  for j in range(3 if small else 4):
   y=-.42+j*(.40 if small else .43);outer=1.12 if small else 1.74 if void else 1.40
   part(f'leg-{j+(0 if side<0 else (3 if small else 4))}',(side*width*.76,y,height-.13))
   points=[(side*width*.76,y,height-.13),(side*outer*.76,y+.09,height+.19),(side*outer,y-.11,.07)]
   stepped(points,[.095,.080,.030],trim,5);voxel(points[1],(.115,.115,.12),shell,6)
   for k in range(4):
    t=(k+1)/5;p=Vector(points[1]).lerp(Vector(points[2]),t);box((p.x,p.y-.07,p.z),(.09,.04,.12),shell if not void else 'purple')
 part('head',(0,-.58,height-.03));voxel((0,-.62,height),(.34 if small else .42,.31,.27 if small else .33),shell,10)
 for side in [-1,1]:
  pixel_eye((side*(.16 if small else .20),-.931,height+.04),.105 if small else .125,light)
  if not small:
   for j in range(2):pixel_eye((side*(.08+j*.13),-.869,height+.25),.037,light)
  stepped([(side*.24,-.81,height-.16),(side*.43,-1.05,height-.28),(side*.22,-1.21,height-.23)],[.085,.07,.024],trim,5)
  if not void:
   for j in range(1 if small else 2):stepped([(side*(.22+j*.10),-.51,height+.24),(side*(.28+j*.11),-.49,height+.53+j*.06),(side*(.20+j*.13),-.48,height+.72+j*.06)],[.065,.05,.013],'gold' if not small else 'old',5)
 if void:
  part('orbit',(0,.30,height+.15))
  for j in range(26):
   a=j*math.tau/26;box((math.sin(a)*.95,.40,height+.15+math.cos(a)*.88),(.070,.065,.085),'lavender')
   if j%3==0:voxel((math.sin(a)*1.02,.4,height+.15+math.cos(a)*.95),(.055,.07,.085),'purple',4)

def voxel_beast(small=False):
 w=.35 if small else .63;d=.76 if small else .97;z=1.01 if small else 1.19
 part('body',(0,.05,z));voxel((0,.05,z),(w,d,.36 if small else .52),'void',12)
 for j in range(6):
  y=-.50+j*.25;box((0,y,z+.28),(.62 if small else 1.02,.22,.14),'plate')
  for s in [-1,1]:box((s*w*.82,y,z+.15),(.15,.20,.25),'plate');box((s*w*.91,y-.11,z+.18),(.04,.035,.13),'purple')
  pixel_leaf((0,y,z+.36),(0,y+.08,z+.59+(j%2)*.11),.16 if small else .25,'lavender')
 for s in [-1,1]:
  for back in [False,True]:
   y=.53 if back else -.56;part(f'leg-{(0 if s<0 else 2)+int(back)}',(s*w*.73,y,z-.1))
   r=.12 if small else .21;stepped([(s*w*.75,y,z-.10),(s*w*.95,y+.08,.48),(s*w*.98,y-.04,.17)],[r,r*.88,r*.8],'plate',5)
   voxel((s*w*.98,y-.11,.13),(r*1.25,r*1.75,.13),'void',8)
   for j in range(3):box((s*w*.98+(j-1)*r*.64,y-r*1.78,.10),(r*.45,r*.70,.11),'lavender')
   if not small:
    for j in range(3):box((s*w*.94,y-.18,.36+j*.13),(.37,.06,.060),'lavender')
 part('head',(0,-.65,z+.08));voxel((0,-.76,z+.14),(.32 if small else .52,.36,.30 if small else .40),'plate',10)
 voxel((0,-1.04,z-.02),(.26 if small else .40,.32,.17),'void',8)
 for s in [-1,1]:
  pixel_eye((s*(.175 if small else .275),-1.083,z+.20),.095 if small else .125,'pink')
  box((s*(.17 if small else .28),-1.08,z+.38),(.23 if small else .32,.10,.07),'void')
  box((s*.12,-1.341,z+.01),(.065,.025,.052),'dark')
  if small:
   pixel_leaf((s*.21,-.56,z+.30),(s*.29,-.43,z+.69),.22,'plate');pixel_leaf((s*.22,-.60,z+.32),(s*.28,-.48,z+.60),.10,'lavender')
  else:
   stepped([(s*.39,-.67,z+.36),(s*.67,-.52,z+.61),(s*.73,-.29,z+.84)],[.16,.12,.027],'lavender',7)
   stepped([(s*.32,-1.18,z-.10),(s*.45,-1.44,z-.04),(s*.46,-1.43,z+.25)],[.09,.075,.018],'lavender',5)
  for j in range(3):box((s*.23,-1.05+j*.085,z-.17),(.045,.065,.105),'bone')
 part('tail',(0,.71,z));stepped([(0,.72,z),(0,1.08,z-.05),(.20,1.36,z+.08),(.33,1.52,z+.31)],[.105,.095,.07,.014],'plate',6)

def voxel_oracle():
 part('body',(0,0,1.06))
 for s in [-1,1]:
  for j in range(4):
   x=s*(.12+j*.14);pixel_leaf((x,.10,1.37),(x+s*.04,-.05,.035+j*.065),.27,'void' if j%2 else 'plate')
   box((x,-.15,.70+j*.035),(.035,.025,.73-j*.06),'lavender')
 part('head',(0,0,1.83));voxel((0,.02,1.96),(.51,.26,.52),'lavender',12)
 voxel((0,-.14,1.58),(.30,.17,.28),'plate',8)
 pixel_eye((0,-.261,1.98),.28,'purple');box((0,-.25,2.35),(.62,.085,.10),'void')
 for s in [-1,1]:
  for j in range(3):box((s*(.42-j*.07),-.18,1.92-j*.14),(.08,.11,.11),'purple')
  for j in range(4):pixel_leaf((s*(.18+j*.10),.06,2.31-j*.095),(s*(.27+j*.16),.10,2.66-j*.08),.17,'void')
 part('orbit',(0,.15,1.78))
 for j in range(30):
  a=j*math.tau/30;box((math.sin(a)*.95,.16,1.79+math.cos(a)*1.03),(.085,.075,.09),'lavender')
  if j%3==0:voxel((math.sin(a)*1.02,.16,1.79+math.cos(a)*1.11),(.060,.075,.095),'purple',5)

def voxel_reaver():
 part('body',(0,0,1.06));voxel((0,.02,1.11),(.34,.25,.43),'iron',8)
 for s in [-1,1]:
  for j in range(4):box((s*.155,-.25,1.00+j*.11),(.24,.075,.065),'bone')
  voxel((s*.41,.0,1.45),(.20,.22,.17),'iron',6);box((s*.41,-.05,1.60),(.31,.23,.05),'old')
  part('left-leg' if s<0 else 'right-leg',(s*.21,0,.73));stepped([(s*.21,0,.73),(s*.23,0,.30)],[.11,.10],'old',5)
  voxel((s*.23,-.06,.14),(.17,.24,.14),'iron',6);box((s*.23,-.29,.105),(.27,.065,.12),'old')
  part('left-arm' if s<0 else 'right-arm',(s*.41,0,1.42));stepped([(s*.41,0,1.42),(s*.50,-.01,1.17),(s*.50,-.09,.92)],[.095,.09,.08],'old',5)
  voxel((s*.50,-.09,.94),(.115,.10,.12),'bone',6)
  if s<0:box((s*.53,-.21,1.09),(.43,.13,.55),'iron');box((s*.53,-.29,1.09),(.31,.035,.44),'red');pixel_skull((s*.53,-.32,1.10),.30)
  else:
   box((s*.50,-.10,.92),(.07,.07,.36),'shade');box((s*.50,-.10,.77),(.29,.10,.05),'gold');box((s*.50,-.10,.46),(.13,.085,.58),'edge');box((s*.58,-.10,.46),(.025,.09,.58),'bone')
 part('head',(0,0,1.56));pixel_skull((0,-.01,1.80),.86)
 for s in [-1,1]:stepped([(s*.25,.01,1.82),(s*.31,.04,2.00),(s*.20,.04,2.09)],[.065,.06,.012],'iron',4)

def voxel_anchor(void=False):
 base='void' if void else 'iron';trim='lavender' if void else 'bone';light='purple' if void else 'fire'
 part('body',(0,0,.75))
 for z,w,h in [(.08,.83,.16),(.21,.68,.10),(.32,.54,.12)]:box((0,0,z),(w,w,h),base)
 voxel((0,0,.97),(.20,.20,.63),trim,8);box((0,-.203,.98),(.25,.035,.97),base)
 for j in range(4):rune((0,-.23,.69+j*.18),.055,light)
 for s in [-1,1]:stepped([(s*.27,0,.32),(s*.45,0,.61),(s*.43,0,1.22),(s*.29,0,1.46)],[.08,.065,.043,.012],trim,6)
 part('head',(0,0,1.63));voxel((0,0,1.67),(.12,.12,.21),light,6)
 for j in range(18):a=j*math.tau/18;box((math.sin(a)*.28,0,1.68+math.cos(a)*.32),(.067,.075,.067),trim)

def brood_nest():
 part('body',(0,0,.25))
 for row in range(3):
  for j in range(15):
   a=(j+row*.35)*math.tau/15;box((math.sin(a)*(.71-row*.04),math.cos(a)*(.56-row*.03),.08+row*.09),(.26,.18,.13),'old' if j%3==0 else 'shade')
 for j in range(11):a=j*math.tau/11;stepped([(math.sin(a)*.75,math.cos(a)*.60,.04),(math.sin(a)*.73,math.cos(a)*.57,.34),(math.sin(a)*.59,math.cos(a)*.43,.48)],[.06,.045,.018],'bone',4)
 part('head',(0,0,.54))
 for x,y,z in [(-.26,-.11,.53),(.27,-.06,.53),(0,.27,.62)]:
  voxel((x,y,z),(.25,.24,.36),'bone',10)
  for j in range(3):box((x+(-.045 if j%2 else .025),y-.23,z-.08+j*.11),(.08,.025,.06),'shade');box((x+(-.045 if j%2 else .025),y-.247,z-.08+j*.11),(.036,.008,.027),'mint' if y>.1 else 'fire')

def make_mesh(key,label,components,pivot):
 verts=[];faces=[];tints=[]
 for v,f,color in components:
  offset=len(verts);verts.extend(p-pivot for p in v);faces.extend(tuple(offset+i for i in face) for face in f);tints.extend([color]*len(f))
 data=bpy.data.meshes.new(f'{key}-{label}');data.from_pydata(verts,[],faces);assert not data.validate(),f'{key}-{label}: invalid mesh';data.materials.append(palette);data.materials.append(glow);data.update()
 attr=data.color_attributes.new(name='CombatTint',type='BYTE_COLOR',domain='CORNER')
 for poly,tint in zip(data.polygons,tints):
  poly.material_index=int(tint in GLOW)
  for i in poly.loop_indices:attr.data[i].color=COLORS[tint]
 obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj)
 return obj

BOSS_CLIPS={
 'ossuary-tyrant':['cleave','barrage','cross','anchors'],
 'marrow-colossus':['ring','cleave','stomps'],
 'grave-cantor':['cross','barrage','ring','notes'],
 'carrion-queen':['barrage','ring','cleave','brood'],
 'rift-sovereign':['cross','cleave','barrage','rifts'],
 'nullweaver':['barrage','cross','webs'],
 'umbral-behemoth':['ring','cleave','barrage','charge'],
 'eclipse-oracle':['ring','cross','gaze'],
}
def boss_pose(key,suffix,label,t,height):
 def ease(value):value=max(0,min(1,value));return value*value*(3-2*value)
 wind=ease(t/.32)*(1-ease((t-.4)/.1));hit=ease((t-.4)/.1)*(1-ease((t-.60)/.4))
 hold=ease(t/.12)*(1-ease((t-.52)/.48))
 r=[0,0,0];p=Vector();s=[1,1,1];side=-1 if label.startswith('left') else 1
 basic=suffix=='auto';power=.58 if basic else 1
 move=BOSS_CLIPS[key][0] if suffix in ['auto','attack'] else suffix
 arm='arm' in label;leg='leg-' in label or label.endswith('-leg')
 if key=='ossuary-tyrant':
  # Both hands and the long cleaver share one rigid shoulder pivot.
  if label=='body':r[2]=-.22*wind+.30*hit;r[0]=.10*hit;p.y=-height*.055*hit
  if arm:r[0]=-.70*wind+1.15*hit;r[2]=-.62*wind+.52*hit
  if label=='head':r[2]=.18*wind-.20*hit
  if move=='barrage':
   if arm:r=[-.30*wind-.90*hit,.18*hold,-.18*hold]
   if label=='body':r[0]=-.08*hold;p.z=height*.02*hold
  elif move=='cross':
   if arm:r=[-.48*wind+.82*hit,.30*wind-.40*hit,.85*wind-.75*hit]
   if label=='body':r[2]=.35*wind-.35*hit
  elif move=='anchors':
   if arm:r=[.40*hold,0,-.25*hold]
   if label=='body':r=[.14*hold,0,0];p.y=-height*.025*hold
   if label=='head':r=[.22*hold,0,0]
 elif key=='marrow-colossus':
  if arm:r[0]=-1.25*wind+.95*hit;r[1]=side*.16*wind
  if label=='body':r[0]=-.12*wind+.23*hit;p.z=height*(.025*wind-.015*hit)
  if label=='head':r[0]=-.14*wind+.20*hit
  if move=='cleave':
   if arm:r[0]=(-.4*wind+.5*hit) if side<0 else -1.5*wind+.8*hit;r[2]=side*(.36*wind-.48*hit)
   if label=='body':r[2]=-.28*wind+.32*hit
  elif move=='stomps':
   if label=='left-leg':r[0]=-.85*wind;p.z=height*.065*wind
   if label=='right-leg':r[0]=.16*wind
   if arm:r[0]=-.30*wind+.35*hit;r[1]=side*.4*wind
   if label=='body':r[1]=-.12*wind;p.z=height*(.025*wind-.035*hit);r[0]=.22*hit
 elif key=='grave-cantor':
  if arm:r[0]=-.55*hold;r[1]=-side*.45*hold;r[2]=side*.18*hold
  if label=='body':r[0]=-.08*wind+.12*hit;p.z=height*.018*hold
  if label=='head':r[0]=-.18*wind+.12*hit
  if label=='halo':r[1]=.20*hold;r[2]=-.30*wind+.45*hit
  if move=='cross':
   if arm:r[2]=side*(.75*wind-.65*hit);r[0]=-.25*wind+.35*hit
   if label=='body':r[2]=.18*wind-.20*hit
  elif move=='ring':
   if arm:r[1]=-side*(.9*wind-.25*hit);r[0]=-.22*wind+.60*hit
   if label=='halo':s=[1+.20*hit]*3
  elif move=='notes':
   beat=math.sin(t*math.tau*2)*hold
   if arm:r=[-.25*hold,-side*.52*hold,side*.22*hold+beat*.12]
   if label=='head':r=[.12*hold,0,beat*.055]
   if label=='halo':r=[0,.16*hold,.12*hold];p.z=height*.035*hold
 elif key in ['carrion-queen','nullweaver']:
  void=key=='nullweaver';front=label in ['leg-0','leg-4'];insect_side=-1 if label in ['leg-0','leg-1','leg-2','leg-3'] else 1
  if label=='body':r[0]=-.18*wind+.20*hit;p.y=-height*.04*hit
  if label=='head':r[0]=-.20*wind+.35*hit;p.y=-height*.045*hit
  if leg:r[1]=insect_side*(.32*wind-.14*hit);r[0]=(-.55*wind+.35*hit) if front else .06*hold
  if move in ['barrage','brood']:
   if label=='body':r[0]=-.22*hold;p.z=height*.028*hold
   if label=='head':r[0]=-.38*wind+.30*hit
   if leg:r[1]=insect_side*.20*hold;r[0]=-.4*hold if front else .06*hold
   if move=='brood' and label=='body':s=[1+.035*hold,1+.09*hold,1+.07*hold]
  elif move in ['ring','cross','webs']:
   if label=='body':r[2]=(.24*wind-.28*hit) if move=='cross' else 0;p.z=height*.04*hold
   if leg:r[1]=insect_side*(.48*wind+.12*hit);r[0]=(-.45*wind if front else .08*wind)
   if move=='webs' and leg:r[1]=insect_side*.32*hold;r[2]=insect_side*.13*hold;r[0]=(-.36 if front else .12)*hold
  if void and label=='orbit':r[1]=-.38*wind+.45*hit;r[2]=.6*hold;s=[1+.16*hold]*3
 elif key=='rift-sovereign':
  if label=='body':p.z=height*.04*hold;r[2]=-.14*wind+.18*hit
  if arm:r[0]=-.50*wind+.65*hit;r[1]=-side*(.55*wind-.20*hit)
  if label=='head':r[0]=-.15*wind+.15*hit
  if label=='orbit':r[2]=-.70*wind+1.15*hit;s=[1+.20*wind-.12*hit]*3
  if move=='cross':
   if arm:r[2]=-side*.70*wind+side*.62*hit;r[0]=-.28*wind+.4*hit
  elif move=='barrage':
   if arm:r[0]=-.65*hold;r[1]=-side*.85*hold
   if label=='orbit':p.z=height*.12*hold;s=[1+.25*hold]*3
  elif move=='rifts':
   if arm:r=[-.35*hold,-side*.72*hold,-side*.22*hold]
   if label=='body':r=[-.07*hold,0,0]
   if label=='orbit':r=[0,0,math.pi*.55*hold];s=[1+.40*hold]*3;p.z=height*.04*hold
 elif key=='umbral-behemoth':
  front=label in ['leg-0','leg-2'];beast_side=-1 if label in ['leg-0','leg-1'] else 1
  if label=='body':r[0]=-.18*wind+.22*hit;p.y=height*(.04*wind-.08*hit)
  if label=='head':r[0]=-.35*wind+.38*hit
  if leg:r[0]=(-.55*wind+.38*hit) if front else .18*wind;r[1]=beast_side*.10*wind
  if label=='tail':r[2]=-.45*wind+.55*hit
  if move=='cleave':
   if label=='head':r=[-.18*wind+.20*hit,0,-.55*wind+.65*hit]
   if label=='body':r[2]=-.20*wind+.24*hit
  elif move=='barrage':
   if label=='head':r[0]=-.7*wind+.22*hit
   if label=='body':r[0]=-.20*hold;p.z=height*.025*hold
  elif move=='charge':
   if label=='body':r[0]=.10*wind-.12*hit;p.y=height*(.055*wind-.16*hit)
   if label=='head':r[0]=.22*wind-.16*hit
   if leg:r[0]=(.35*wind-.55*hit) if front else -.28*wind+.40*hit
   if label=='tail':r[0]=-.18*wind+.28*hit;r[2]=.12*hold
 elif key=='eclipse-oracle':
  if label=='body':p.z=height*.055*hold;r[0]=-.08*wind+.12*hit
  if label=='head':r[0]=-.18*wind+.23*hit;p.y=-height*.045*hit
  if label=='orbit':r[1]=.42*wind-.52*hit;r[2]=-.6*wind+.8*hit;s=[1+.16*wind+.05*hit]*3
  if move=='cross':
   if label=='head':r[2]=-.26*wind+.30*hit
   if label=='orbit':r[0]=.40*wind-.45*hit;r[2]=math.pi*.25*hold
  elif move=='gaze':
   if label=='body':r=[0,0,0];p.z=height*.045*hold
   if label=='head':r=[-.10*wind+.12*hit,0,0];s=[1+.10*hold]*3
   if label=='orbit':r=[0,math.pi*.45*hold,math.pi*.25*hold];s=[1+.24*hold]*3
 return [v*power for v in r],p*power,[1+(v-1)*power for v in s]

def animate(key,rig,bases,height):
 def ramp(t,a,b):v=max(0,min(1,(t-a)/(b-a)));return v*v*(3-2*v)
 floating=key in ['void-cantor','rift-sovereign'];objective='anchor' in key or key=='brood-nest'
 for suffix,frames in [('idle',60),('walk',36),('auto',30),('attack',48),('death',60)]+[(clip,60) for clip in BOSS_CLIPS.get(key,[])]:
  clip=f'{key}-{suffix}'
  for label,obj in rig.items():
   for frame in sorted(set(range(0,frames+1,3))|{round(frames*.4),round(frames*.5),round(frames*.6)}):
    t=frame/frames;wave=math.sin(t*math.tau);pos=Vector();rot=[0,0,0];scale=[1,1,1]
    side=-1 if 'left' in label or label in ['leg-0','leg-2','leg-4'] else 1
    if suffix in ['idle','walk']:
     strength=.40 if suffix=='walk' else .016
     if label=='body' and not objective:pos.z=(1-math.cos(t*math.tau))*height*(.015 if floating else .005);rot[1]=wave*.014
     if 'leg' in label:rot[0]=wave*strength*side
     if 'arm' in label:rot[0]=-wave*strength*side*.55
     if label=='head':rot[2]=wave*.032
     if label=='tail':rot[2]=wave*.18
     if label=='orbit':rot[2]=t*math.tau
     if objective and label=='head':rot[2]=wave*.08;pos.z=(1-math.cos(t*math.tau))*.018
    elif key in BOSS_CLIPS and suffix!='death':
     rot,pos,scale=boss_pose(key,suffix,label,t,height)
    elif suffix in ['auto','attack']:
     wind=ramp(t,0,.32)*(1-ramp(t,.4,.5));hit=ramp(t,.4,.5)*(1-ramp(t,.6,1));power=.68 if suffix=='auto' else 1
     if label=='body' and not objective:rot[0]=(-.10*wind+.19*hit)*power;pos.y=height*(.025*wind-.06*hit)*power
     if 'arm' in label:rot[0]=(-.58*wind+1.1*hit)*power if key=='ossuary-tyrant' else (.40*wind-1.0*hit)*power;rot[1]=side*.15*wind*power
     if label=='head':rot[0]=(-.10*wind+.15*hit)*power
     if label=='orbit':rot[2]=(-.8*wind+1.4*hit)*power;scale=[1+.25*wind]*3
    else:
     p=ramp(t,0,.8)
     if label=='body':rot[0]=.50*p;rot[1]=.15*p;scale=[1-.05*p,1-.05*p,1-.78*p];pos.z=-height*.28*p
     if 'arm' in label:rot[1]=side*.30*p
     if 'leg' in label:rot[0]=side*.18*p
     if label=='head':rot[0]=.35*p
     if label=='orbit':scale=[1+.35*p]*3;rot[2]=p*1.1
    obj.location=bases[label]+pos;obj.rotation_euler=rot;obj.scale=scale
    for field in ['location','rotation_euler','scale']:obj.keyframe_insert(data_path=field,frame=frame)
   action=obj.animation_data.action;action.name=f'{clip}-{label}'
   for fc in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves:
    for point in fc.keyframe_points:point.interpolation='LINEAR'
   track=obj.animation_data.nla_tracks.new();track.name=clip;track.strips.new(clip,0,action).extrapolation='NOTHING';obj.animation_data.action=None
   obj.location=bases[label];obj.rotation_euler=(0,0,0);obj.scale=(1,1,1)
  # Ground correction is sampled against actual vertices, including long weapons.
  import numpy as np
  coords={obj:np.array([tuple(v.co) for v in obj.data.vertices]) for obj in rig.values()}
  for obj in rig.values():
   for track in obj.animation_data.nla_tracks:track.mute=track.name!=clip
  action=bpy.data.actions[f'{clip}-body'];curves=action.layers[0].strips[0].channelbag(action.slots[0]).fcurves;vertical=next(fc for fc in curves if fc.data_path=='location' and fc.array_index==2)
  corrections=[]
  for frame in range(frames+1):
   scene.frame_set(frame);bpy.context.view_layer.update()
   low=min(float((vs@np.array(obj.matrix_world[2][:3])+obj.matrix_world[2][3]).min()) for obj,vs in coords.items())
   corrections.append(vertical.evaluate(frame)+(-low if suffix=='death' and frame>=frames*.8 else max(0,-low)))
  vertical.keyframe_points.clear()
  for frame,value in enumerate(corrections):vertical.keyframe_points.insert(frame,value,options={'FAST'}).interpolation='LINEAR'
  vertical.update()
  lows=[]
  for frame in range(frames+1):
   scene.frame_set(frame);bpy.context.view_layer.update()
   lows.append(min(float((vs@np.array(obj.matrix_world[2][:3])+obj.matrix_world[2][3]).min()) for obj,vs in coords.items()))
  assert min(lows)>-.002,(key,suffix,min(lows))
  stats[key]['clips'][suffix]={'seconds':frames/30,'min_ground':round(min(lows),5),'final_ground':round(lows[-1],5)}
 for obj in rig.values():
  for track in obj.animation_data.nla_tracks:track.mute=True
 scene.frame_set(0)
 for label,obj in rig.items():obj.location=bases[label];obj.rotation_euler=(0,0,0);obj.scale=(1,1,1)

MODELS=[('bone-reaver',voxel_reaver,2.3),('ossuary-scarab',lambda:voxel_insect(small=True),1.55),('rift-stalker',lambda:voxel_beast(True),1.85),('void-cantor',lambda:voxel_priest(True),2.45),('ossuary-tyrant',voxel_tyrant,4.8),('marrow-colossus',voxel_colossus,4.8),('grave-cantor',voxel_priest,4.8),('carrion-queen',voxel_insect,4.4),('rift-sovereign',voxel_sovereign,4.9),('nullweaver',lambda:voxel_insect(True),4.4),('umbral-behemoth',voxel_beast,4.7),('eclipse-oracle',voxel_oracle,4.9),('bone-anchor',voxel_anchor,2.2),('rift-anchor',lambda:voxel_anchor(True),2.2),('brood-nest',brood_nest,1.5)]
candidate='--candidate' in sys.argv
if candidate:MODELS=[entry for entry in MODELS if entry[0] in ['ossuary-tyrant','rift-sovereign']];OUT=DEST/'boss-style-candidate.glb'
for key,builder,height in MODELS:
 active=key;parts={};pivots={};builder()
 vertices=[v for components in parts.values() for vs,_,_ in components for v in vs];bottom=min(v.z for v in vertices);top=max(v.z for v in vertices);factor=height/(top-bottom)
 for label,components in parts.items():
  for vs,_,_ in components:
   for v in vs:v.z-=bottom;v*=factor
  pivots[label].z-=bottom;pivots[label]*=factor
 root=bpy.data.objects.new(key,None);scene.collection.objects.link(root);roots[key]=root
 root['axes']='metres, Y-up/+Z-front in GLB; ground origin';root['original_art']=True;root['attack_contact']=.5
 rig={label:make_mesh(key,label,components,pivots[label]) for label,components in parts.items()};bases={}
 for label,obj in rig.items():obj.parent=root if label=='body' else rig['body'];obj.location=pivots[label]-(Vector() if label=='body' else pivots['body']);bases[label]=obj.location.copy()
 vertices=[v for components in parts.values() for vs,_,_ in components for v in vs]
 rigs[key]=rig;stats[key]={'height':height,'width':round(max(v.x for v in vertices)-min(v.x for v in vertices),4),'depth':round(max(v.y for v in vertices)-min(v.y for v in vertices),4),'parts':len(rig),'polygons':sum(len(obj.data.polygons) for obj in rig.values()),'clips':{}}
 animate(key,rig,bases,height)
 print('MODEL',key,json.dumps(stats[key]),flush=True)

# Export every character at identity; editing layout is saved only after the runtime export.
scene.frame_set(0);bpy.ops.object.select_all(action='DESELECT')
for root in roots.values():
 for obj in [root,*root.children_recursive]:obj.select_set(True)
for rig in rigs.values():
 for obj in rig.values():
  for track in obj.animation_data.nla_tracks:track.mute=False
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',export_force_sampling=False,export_cameras=False,export_lights=False,export_extras=True)
data=OUT.read_bytes();length=struct.unpack_from('<I',data,12)[0];gltf=json.loads(data[20:20+length]);names={a['name'] for a in gltf.get('animations',[])}
expected={f'{key}-{suffix}' for key,_,_ in MODELS for suffix in ['idle','walk','auto','attack','death',*BOSS_CLIPS.get(key,[])]};assert names==expected,(names-expected,expected-names)
assert len(gltf['materials'])==2
for root in roots.values():assert tuple(root.location)==(0,0,0) and tuple(root.scale)==(1,1,1)
report={'models':stats,'clips':len(names),'materials':len(gltf['materials']),'bytes':len(data),'axes':'GLB +Y up / +Z front, feet at Y=0','original_art':True}
(DEST/('candidate-audit.json' if candidate else 'monster-audit.json')).write_text(json.dumps(report,indent=2)+'\n')
for i,(key,root) in enumerate(roots.items()):
 root.location=((i%4)*6,(i//4)*7,0)
 for obj in rigs[key].values():
  for track in obj.animation_data.nla_tracks:track.mute=True
scene.frame_set(0)
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=26;area.spaces.active.region_3d.view_location=(9,3,2)
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(DEST/('boss-style-candidate.blend' if candidate else 'instant-combat-monsters.blend')))

if '--render' in sys.argv:
 scene.render.engine='BLENDER_EEVEE';scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
 scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.030,.05,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.75
 def light(name,loc,energy,color,size,target=(0,0,0)):
  d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
 lights=[light('Key',(-8,-14,11),2300,(1,.80,.62),10),light('Fill',(9,-7,5),2100,(.65,.69,1),10),light('Rim',(0,7,8),3000,(.64,.35,1),8)]
 camdata=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO'
 if candidate:
  for filename,key in [('assets/source/raid-approach-monsters.blend','morgrath'),('assets/source/autumn-pets.blend','bramble-badger')]:
   with bpy.data.libraries.load(str(ROOT/filename),link=False) as (source,target):target.objects=[name for name in source.objects if (name==key or name.startswith(key+'-')) and '.' not in name]
   for obj in target.objects:
    if obj and obj.name not in scene.objects:scene.collection.objects.link(obj)
    if obj:obj.animation_data_clear()
   root=bpy.data.objects[key];root.location=(0,0,0);root.rotation_euler=(0,0,0);root.scale=(1,1,1);bpy.context.view_layer.update()
   vs=[obj.matrix_world@v.co for obj in root.children_recursive if obj.type=='MESH' for v in obj.data.vertices]
   stats[key]={'height':max(v.z for v in vs)-min(v.z for v in vs),'width':max(v.x for v in vs)-min(v.x for v in vs)};roots[key]=root
 labels=[]
 for i,(key,root) in enumerate(roots.items()):
  s=min(2.9/stats[key]['height'],3.5/stats[key]['width']);root.scale=(s,)*3;root.rotation_euler.z=-.32;root.location=((i%4-1.5)*4.0,0,-(i//4)*4.0)
  d=bpy.data.curves.new(key+' title','FONT');d.body=('REFERENCE: ' if key in ['morgrath','bramble-badger'] else '')+key.replace('-',' ').upper();d.align_x='CENTER';d.size=.19;d.space_character=1.1
  o=bpy.data.objects.new(d.name,d);scene.collection.objects.link(o);o.location=(root.location.x,-.75,root.location.z-.50);o.rotation_euler=(math.pi/2,0,0);labels.append(o)
  mat=bpy.data.materials.get('Review type') or bpy.data.materials.new('Review type');mat.diffuse_color=(.7,.7,.8,1);d.materials.append(mat)
 cam.location=(0,-40,8);cam.rotation_euler=(Vector((0,0,1.2 if candidate else -4.6))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.ortho_scale=17.8
 scene.render.resolution_x=2400 if candidate else 2000;scene.render.resolution_y=950 if candidate else 2100;scene.render.filepath=str(DEST/('boss-style-comparison.png' if candidate else 'monster-contact-sheet.png'));bpy.ops.render.render(write_still=True)
 for o in labels:o.hide_render=True
 for key in [name for name,_,_ in MODELS if stats[name]['height']>=4]:
  for name,root in roots.items():
   for obj in root.children_recursive:obj.hide_render=name!=key
   root.location=(0,0,0);root.scale=(1,1,1);root.rotation_euler.z=-.30
  bpy.context.view_layer.update()
  points=[obj.matrix_world@v.co for obj in roots[key].children_recursive if obj.type=='MESH' for v in obj.data.vertices]
  low=Vector(tuple(min(p[i] for p in points) for i in range(3)));high=Vector(tuple(max(p[i] for p in points) for i in range(3)));target=(low+high)/2
  cam.location=target+Vector((0,-13,4.3));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
  right=cam.rotation_euler.to_matrix()@Vector((1,0,0));up=cam.rotation_euler.to_matrix()@Vector((0,1,0))
  width=max(p.dot(right) for p in points)-min(p.dot(right) for p in points);height=max(p.dot(up) for p in points)-min(p.dot(up) for p in points)
  camdata.ortho_scale=max(width,height)*1.34
  scene.render.resolution_x=1200;scene.render.resolution_y=1400;scene.render.filepath=str(DEST/f'{"candidate-" if candidate else ""}{key}-preview.png');bpy.ops.render.render(write_still=True)
 print('ASSET_QA',json.dumps(report),flush=True)

if '--render-attacks' in sys.argv:
 # Freeze sampled NLA poses into a review sheet; the saved editable source stays untouched.
 scene.render.engine='BLENDER_EEVEE';scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
 scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.026,.033,.04,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.8
 samples=[]
 for row,key in enumerate(BOSS_CLIPS):
  root=roots[key];root.location=(0,0,0);root.rotation_euler=(0,0,-.28);root.scale=(1,1,1)
  for col,(suffix,phase,label) in enumerate([(BOSS_CLIPS[key][0],.32,'WINDUP'),(BOSS_CLIPS[key][0],.5,'IMPACT'),(BOSS_CLIPS[key][-1],.4,'RITUAL'),(BOSS_CLIPS[key][0],.85,'RECOVERY')]):
   for obj in rigs[key].values():
    for track in obj.animation_data.nla_tracks:track.mute=track.name!=f'{key}-{suffix}'
   scene.frame_set(round(phase*60));bpy.context.view_layer.update()
   for obj in rigs[key].values():
    sample=bpy.data.objects.new(f'Review {key} {label} {obj.name}',obj.data.copy());scene.collection.objects.link(sample);sample.matrix_world=obj.matrix_world.copy();sample.location+=Vector(((col-1.5)*7.5,0,-row*7.5));samples.append(sample)
   data=bpy.data.curves.new(f'{key} {label}','FONT');data.body=f'{key.replace("-"," ").upper()}\n{label} / {suffix.upper()}';data.align_x='CENTER';data.size=.20;data.space_line=1.25
   text=bpy.data.objects.new(data.name,data);scene.collection.objects.link(text);text.location=((col-1.5)*7.5,-1.9,-row*7.5-.45);text.rotation_euler=(math.pi/2,0,0)
   mat=bpy.data.materials.get('Attack review type') or bpy.data.materials.new('Attack review type');mat.diffuse_color=(.82,.84,.80,1);data.materials.append(mat)
 for root in roots.values():
  for obj in root.children_recursive:obj.hide_render=True
 for row in range(8):
  for side in [-1,1]:
   data=bpy.data.lights.new(f'Attack review {row} {side}','AREA');data.energy=1400;data.color=(1,.84,.64) if side<0 else (.58,.65,1);data.shape='DISK';data.size=12;data.use_shadow=False
   lamp=bpy.data.objects.new(data.name,data);scene.collection.objects.link(lamp);lamp.location=(side*9,-10,5-row*7.5);lamp.rotation_euler=(Vector((0,0,2-row*7.5))-lamp.location).to_track_quat('-Z','Y').to_euler()
 data=bpy.data.cameras.new('Attack review camera');cam=bpy.data.objects.new(data.name,data);scene.collection.objects.link(cam);scene.camera=cam;data.type='ORTHO';data.ortho_scale=62
 cam.location=(0,-80,-23);cam.rotation_euler=(math.pi/2,0,0)
 scene.render.resolution_x=1800;scene.render.resolution_y=3200;scene.render.filepath=str(DEST/'boss-attack-contact-sheet.png');bpy.ops.render.render(write_still=True)
