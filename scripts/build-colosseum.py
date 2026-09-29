"""Original Mossvale arena. Blender --background --python scripts/build-colosseum.py -- --render
Metres, runtime Y-up, +Z main entrance. Radius42.5 combat floor with four 6m cover pillars; radius45..65 stands.
Four cardinal 16m passages. Authored coordinates below scale 2.5 horizontally and 1.5 vertically. All structures share one vertex palette; no textures.
"""
import bpy, bmesh, json, math, random, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/colosseum.blend'
EXPORT = ROOT / 'public/models/colosseum.glb'
PREVIEW = ROOT / 'assets/source/colosseum-preview.png'
random.seed(219)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.name = 'Mossvale - Thornring Arena'
scene.unit_settings.system = 'METRIC'
HEX = {'stone':'A6AC8D', 'light':'C4C8A7', 'shade':'828C73', 'dark':'626F5D',
       'mortar':'74806A', 'moss':'697F45', 'mosslight':'96A85D', 'sand':'9B8B67',
       'sandlight':'A99973', 'sanddark':'928364', 'wood':'574331', 'woodlight':'826B48',
       'red':'955342', 'redlight':'B76B48', 'redshade':'783F36', 'clothfade':'BA8156',
       'gold':'BAA264', 'iron':'34433B', 'flame':'EDAA46', 'flamelight':'FFE09B',
       'blue':'397D86', 'bluelight':'62A2A4', 'blueshade':'2F5967', 'bluefade':'93B6AF'}
def linear(v): return v / 12.92 if v <= .04045 else ((v+.055)/1.055)**2.4
COLORS = {k: tuple(linear(int(h[i:i+2],16)/255) for i in (0,2,4))+(1,) for k,h in HEX.items()}
def xyz(x,y,z): return (x*2.5,-z*2.5,y*1.5)
def radial(a,r,y=0,t=0): return (math.sin(a)*r+math.cos(a)*t,y,math.cos(a)*r-math.sin(a)*t)
parts = {'Stone timber and canvas': {'v':[], 'f':[], 'c':[]}, 'Brazier embers': {'v':[], 'f':[], 'c':[]}}
active = parts['Stone timber and canvas']
def mesh(v,f,color):
    n=len(active['v']); active['v'].extend(xyz(*p) for p in v)
    active['f'].extend(tuple(i+n for i in face) for face in f)
    active['c'].extend([COLORS[color]]*len(f))
def box(color,x,y,z,w,h,d,a=0):
    c,s=math.cos(a),math.sin(a)
    mesh([(x+i*w/2*c+k*d/2*s,y+j*h/2,z-i*w/2*s+k*d/2*c) for i,j,k in
          [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],
         [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],color)
def rbox(color,a,r,y,w,h,d,t=0): box(color,*radial(a,r,y,t),w,h,d,a)
def beam(color,p,q,w):
    p,q=Vector(p),Vector(q); axis=(q-p).normalized(); u=axis.cross(Vector((0,1,0)))
    if u.length<.01: u=axis.cross(Vector((0,0,1)))
    u.normalize();v=axis.cross(u).normalized()
    mesh([tuple(end+(u*i+v*j)*w/2) for end in [p,q] for i,j in [(-1,-1),(1,-1),(1,1),(-1,1)]],
         [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],color)
def prism(poly,y0,y1,color):
    n=len(poly)
    mesh([(x,y,z) for y in (y0,y1) for x,z in poly],
         [tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],color)
def clip(poly,axis,sign,edge=3.2):
    out=[]
    for p,q in zip(poly,poly[1:]+poly[:1]):
        dp,dq=sign*p[axis]-edge,sign*q[axis]-edge
        if dp>=0:out.append(p)
        if (dp>=0)!=(dq>=0):
            t=dp/(dp-dq);out.append(tuple(p[i]+(q[i]-p[i])*t for i in (0,1)))
    return out
def ring(r0,r1,y0,y1,color,gates=True,segments=96):
    for i in range(segments):
        a,b=i*math.tau/segments,(i+1)*math.tau/segments
        poly=[(math.sin(t)*r,math.cos(t)*r) for r,t in [(r0,a),(r1,a),(r1,b),(r0,b)]]
        if gates:
            mid=(a+b)/2
            poly=clip(clip(poly,0,1 if math.sin(mid)>=0 else -1),1,1 if math.cos(mid)>=0 else -1)
        if len(poly)>=3:prism(poly,y0,y1,random.choice(color) if isinstance(color,list) else color)
def profile(a,r,points,depth,color):
    # Extruded radial facade profile, authored as tangent/height coordinates.
    n=len(points)
    mesh([radial(a,r+dr,y,t) for dr in (-depth/2,depth/2) for t,y in points],
         [tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],color)
def horn(a,r,y,height=2.8):
    levels=[(0,1.05,0),(.30,.83,.06),(.66,.54,.25),(1,.06,.66)]
    v=[]
    for h,w,offset in levels:
        for t,dr in [(-w,-w*.6),(w,-w*.6),(w,w*.6),(-w,w*.6)]:v.append(radial(a,r+dr+offset,y+h*height,t))
    mesh(v,[(0,3,2,1),(12,13,14,15)]+[(j*4+i,j*4+(i+1)%4,(j+1)*4+(i+1)%4,(j+1)*4+i) for j in range(3) for i in range(4)],'stone')
    rbox('light',a,r+.07,y+.20,1.7,.11,1.15)

# A flat, traversable sand floor. The low relief sand inlays never exceed 4cm.
prism([(math.sin(i*math.tau/144)*18.4,math.cos(i*math.tau/144)*18.4) for i in range(144)],-.14,.025,'sand')
ring(16.89,17.0,.026,.035,'red',False)
for i in range(18):
    a=i*math.tau/18;r=8+(i%2)*6;x,_,z=radial(a,r)
    poly=[(x+math.cos(j*math.tau/6)*.55,z+math.sin(j*math.tau/6)*.35) for j in range(6)]
    prism(poly,.029,.033,random.choice(['sandlight','sanddark']))
for a in [i*math.pi/2 for i in range(4)]:
    for n in range(10):rbox('sandlight',a,18.6+n*.73,.012,6.35,.022,.715)

# A worn compass crest and flush approach pads keep the center legible in combat.
ring(3.9,4.05,.028,.035,'dark',False,64)
ring(4.08,4.3,.028,.035,'gold',False,64)
ring(4.35,4.55,.028,.035,'light',False,64)
for i in range(8):
    a=i*math.pi/4
    poly=[(p[0],p[2]) for p in [radial(a,3.7),radial(a,1.25,t=.37),radial(a,.55),radial(a,1.25,t=-.37)]]
    prism(poly,.03,.037,'gold' if i%2==0 else 'shade')
ring(.48,.72,.03,.037,'light',False,32)
for g,color in [(0,'red'),(2,'blue')]:
    a=g*math.pi/2
    rbox('dark',a,13.9,.024,4.85,.016,2.6)
    rbox(color,a,13.9,.036,4.65,.016,2.4)
    for t in [-2.15,2.15]:rbox('gold',a,13.9,.044,.055,.01,2.15,t)
    for r in [12.83,14.97]:rbox('gold',a,r,.044,4.3,.01,.055)
    for t in [-.64,.64]:
        beam('gold',radial(a,13.35,.032,t-.24),radial(a,14.45,.032,t+.24),.025)

# Four original thorn-crowned bastions: real cover shared with colosseum.ts.
# Coordinates are runtime +/-18m; all geometry stays inside the solid 6m square.
for px,pz in [(-18,-18),(18,-18),(-18,18),(18,18)]:
    name=f'Cover pillar {"N" if pz<0 else "S"}{"E" if px>0 else "W"}'
    parts[name]={'v':[], 'f':[], 'c':[]};active=parts[name]
    x,z=px/2.5,pz/2.5
    box('dark',x,.22,z,2.4,.44,2.4)
    box('light',x,.49,z,2.4,.12,2.4)
    box('shade',x,2.15,z,2.24,3.2,2.24)
    for row in range(6):
        y=.81+row*.49
        for side in [-1,1]:
            for k in range(3):
                t=(k-1)*.72
                box(random.choice(['stone','stone','shade','light']),x+t,y,z+side*1.125,.69,.465,.05)
                box(random.choice(['stone','stone','shade','light']),x+side*1.125,y,z+t,.05,.465,.69)
    for side in [-1,1]:
        for other in [-1,1]:
            box('light',x+side*1.04,2.10,z+other*1.04,.19,3.08,.19)
    box('dark',x,3.76,z,2.30,.15,2.30)
    box('gold',x,3.87,z,2.34,.08,2.34)
    box('light',x,4.02,z,2.4,.22,2.4)
    for side in [-1,1]:
        for other in [-1,1]:
            cx,cz=x+side*.88,z+other*.88
            box('shade',cx,4.32,cz,.55,.4,.55)
            mesh([(cx+dx,4.52,cz+dz) for dx,dz in [(-.275,-.275),(.275,-.275),(.275,.275),(-.275,.275)]]+[(cx-side*.08,4.66,cz-other*.08)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],'light')
    # Small diamond crest and creeping moss on each outward face.
    cloth='blue' if pz<0 else 'red'
    for side in [-1,1]:
        box('wood',x,3.24,z+side*1.175,1.45,.12,.05)
        mesh([(x+dx,y,z+side*1.177) for dx,y in [(-.62,3.19),(.62,3.19),(.62,1.94),(0,1.66),(-.62,1.94)]],[(0,1,2,3,4)],cloth)
        mesh([(x+dx,y,z+side*1.181) for dx,y in [(0,2.97),(.26,2.62),(0,2.27),(-.26,2.62)]],[(0,1,2,3)],'gold')
        for k in range(7):
            box('mosslight' if k%3==0 else 'moss',x+side*(.78+math.sin(k)*.15),.66+k*.38,z-side*1.163,.22,.27,.035)
    active=parts['Stone timber and canvas']

# Fifteen steep, continuous spectator terraces; four precisely clipped aisles.
ring(18,18.6,0,.9,['shade','stone','mortar'])
ring(17.99,18.69,.9,1.0,'light')
for row in range(15):
    r0=18.60+row*.43;top=1.45+row*.40
    ring(r0,r0+.433,0,top,['stone','stone','light','shade'])
    ring(r0-.014,r0+.45,top,top+.07,'light')
ring(25.02,25.83,0,7.75,['shade','stone','stone'])
ring(24.94,25.98,7.75,8.03,'light')
ring(25.18,25.85,7.08,7.30,'dark')

# Visible coursed exterior masonry, staggered and tinted by face.
for row in range(11):
    for i in range(64):
        a=(i+(row%2)*.5)*math.tau/64
        x,_,z=radial(a,25.65)
        if min(abs(x),abs(z))<4.3:continue
        rbox(random.choice(['stone','stone','shade','light']),a,25.76,.34+row*.64,2.44,.605,.28)
        if random.random()<.15:rbox('moss',a,25.925,.58+row*.64,random.uniform(.4,1.7),.10,.03)

# Carved buttresses and tall, inward-curving stone horns form the bowl silhouette.
for i in range(16):
    a=(i+.5)*math.tau/16
    rbox('shade',a,25.15,3.95,1.18,7.9,1.54)
    rbox('stone',a,25.25,6.70,1.6,.32,1.70)
    horn(a,25.0,8.02,2.4+(i%3)*.27)
    for k in range(4):rbox('moss' if k%2 else 'mosslight',a,25.94,1.1+k*.39,.6-k*.06,.26,.06,t=(-1)**i*.24)

# The three side gates and the main south gateway have a 6.4m unobstructed opening.
for g in range(4):
    a=g*math.pi/2;main=g==0;top=11.60 if main else 8.65
    banner='blue' if g==2 else 'red'
    for side in [-1,1]:
        # Trapezoidal stone jambs lean outward, preserving the full gate clearance.
        profile(a,24.40,[(side*3.22,0),(side*5.9,0),(side*5.35,6.0),(side*3.22,6.0)],3.10,'stone')
        rbox('shade',a,25.99,3.0,1.18,6.0,.10,side*4.20)
        rbox('light',a,25.97,1.0,1.55,.35,.16,side*4.25)
        rbox('light',a,25.97,4.70,1.5,.27,.16,side*4.20)
        for k in range(6):rbox('moss',a,26.06,1.4+k*.31,.30,.23,.025,side*(4.1+math.sin(k)*.32))
    profile(a,24.40,[(-5.35,6.0),(-3.2,6.0),(-2.7,6.6),(-1.9,7.15),(1.9,7.15),(2.7,6.6),(3.2,6.0),(5.35,6.0),(4.90,top),(2.90,top+.45),(-2.90,top+.45),(-4.90,top)],3.10,'stone')
    rbox('light',a,24.40,top+.48,6.10,.30,3.30)
    rbox('dark',a,26.015,top-.76,5.70,.10,.045)
    horn(a,24.55,top+.61,1.55 if main else 1.08)
    # Original angular guardian mask with heavy brows and brass inset eyes.
    faceY=top-1.65
    profile(a,26.02,[(-1.7,faceY+1.3),(1.7,faceY+1.3),(1.4,faceY-.50),(0,faceY-1.0),(-1.4,faceY-.50)],.20,'shade')
    for side in [-1,1]:
        profile(a,26.16,[(side*.16,faceY+.47),(side*1.48,faceY+.80),(side*1.29,faceY+.28),(side*.22,faceY+.14)],.15,'light')
        rbox('dark',a,26.27,faceY+.12,.83,.29,.035,side*.79)
        rbox('gold',a,26.30,faceY+.11,.40,.14,.035,side*.77)
    profile(a,26.21,[(-.25,faceY+.48),(.25,faceY+.48),(.45,faceY-.48),(0,faceY-.76),(-.45,faceY-.48)],.30,'light')
    # Wooden brackets and red hanging tabs flank the entry above head height.
    for side in [-1,1]:
        rbox('wood',a,25.96,6.2,1.3,.14,.22,side*4.7)
        profile(a,26.13,[(side*4.2,6.15),(side*5.2,6.15),(side*5.2,4.9),(side*4.7,4.65),(side*4.2,4.9)],.045,banner)
        profile(a,26.17,[(side*4.7,5.83),(side*4.9,5.54),(side*4.7,5.25),(side*4.5,5.54)],.015,'gold')
    if g in (0,2):
        # Raised iron teeth make the two opposing fighter entrances unmistakable.
        for t in range(-6,7):rbox('iron',a,23.55,5.65,.075,1.05,.075,t*.45)
        for y in [5.42,5.98]:rbox('iron',a,23.55,y,5.60,.085,.09)
        for side in [-1,1]:
            rbox('gold',a,22.91,5.45,.08,.12,.08,side*2.9)
            rbox('wood',a,23.8,5.1,1.48,.12,.15,side*4.45)
            profile(a,23.7,[(side*3.83,5.05),(side*5.07,5.05),(side*5.07,2.58),(side*4.45,2.2),(side*3.83,2.58)],.045,banner)
            profile(a,23.64,[(side*4.45,4.46),(side*4.79,3.92),(side*4.45,3.38),(side*4.11,3.92)],.025,'gold')

# Weathered red and teal awnings on wooden poles: three over each seating quadrant.
for q in range(4):
    for j in range(3):
        a=q*math.pi/2+(j+1)*math.pi/8;w=4.4;r0,r1=22.25,25.40
        blue=math.cos(a)<0
        palette=['blueshade','blue','bluelight','blue','blue','blueshade'] if blue else ['redshade','red','redlight','red','red','redshade']
        for side in [-1,1]:
            beam('wood',radial(a,25.30,6.80,side*w/2),radial(a,25.30,9.40,side*w/2),.16)
            beam('wood',radial(a,r0-.22,8.20,side*w/2),radial(a,r1+.34,9.22,side*w/2),.17)
        for r,y in [(r0,8.20),(r1,9.18)]:beam('woodlight',radial(a,r,y,-w/2-.26),radial(a,r,y,w/2+.26),.13)
        for k in range(6):
            t0=-w/2+k*w/6;t1=t0+w/6
            v=[radial(a,r,y,t) for r,y in [(r0,8.18),(23.70,8.36),(r1,9.16)] for t in [t0,t1]]
            mesh(v,[(0,1,3,2),(2,3,5,4)],palette[k])
            # Hanging edge and a few patched canvas panels.
            mesh([radial(a,r0,y,t) for t,y in [(t0,8.18),(t1,8.18),(t1,7.91-(k%2)*.11),(t0,7.95)]],[(0,1,2,3)],palette[0])
            if k in (1,4):rbox('bluefade' if blue else 'clothfade',a,r0-.018,8.03,.24,.09,.025,t=(t0+t1)/2)
        # Brass ties give the canvas a warm, worn rim without any textures.
        for side in [-1,1]:rbox('gold',a,r0,8.24,.09,.13,.22,t=side*w/2)

# Rim braziers have lightweight modeled fire; the runtime needs no point lights.
for i in range(8):
    a=(i+.5)*math.pi/4;r=18.45
    rbox('shade',a,r,1.30,.68,.60,.68)
    rbox('iron',a,r,1.71,.88,.22,.88)
    for t in [-.31,.31]:rbox('iron',a,r,1.94,.06,.49,.62,t=t)
    active=parts['Brazier embers']
    for j in range(3):
        t=(j-1)*.21;y=1.90;h=.51+(j%2)*.26
        p=[radial(a,r+dr,y,t+dt) for dt,dr in [(-.18,-.18),(.18,-.18),(.18,.18),(-.18,.18)]]+[radial(a,r+.03,y+h,t+.05)]
        mesh(p,[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],'flame' if j!=1 else 'flamelight')
    active=parts['Stone timber and canvas']

parent=bpy.data.objects.new('Colosseum',None);scene.collection.objects.link(parent)
parent['contract']='Original Mossvale arena; Y-up glTF; +Z main entrance; radius42.5 combat floor; four solid 6m cover pillars at (+/-18,+/-18); full-depth 16m cardinal passages; walkable spectator terraces.'
parent['combatRadius']=42.5;parent['innerWallRadius']=45.0;parent['outerWallRadius']=65.0;parent['gateWidth']=16.0
metrics={'triangles':0,'meshes':0,'bounds':None}
allpoints=[]
for name,data in parts.items():
    material=bpy.data.materials.new(name+' palette');material.use_nodes=True
    shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.9
    color=material.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='ColosseumTint'
    material.node_tree.links.new(color.outputs['Color'],shader.inputs['Base Color'])
    if name=='Brazier embers':
        material.node_tree.links.new(color.outputs['Color'],shader.inputs['Emission Color']);shader.inputs['Emission Strength'].default_value=1.4
    material.use_backface_culling=False
    m=bpy.data.meshes.new(name);m.from_pydata(data['v'],[],data['f']);m.materials.append(material);m.update()
    attr=m.color_attributes.new(name='ColosseumTint',type='BYTE_COLOR',domain='CORNER')
    for face,c in zip(m.polygons,data['c']):
        for index in face.loop_indices:attr.data[index].color=c
    bm=bmesh.new();bm.from_mesh(m);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(m);bm.free()
    obj=bpy.data.objects.new(name,m);scene.collection.objects.link(obj);obj.parent=parent
    metrics['triangles']+=sum(len(p.vertices)-2 for p in m.polygons);metrics['meshes']+=1
    allpoints.extend((v.co.x,v.co.z,-v.co.y) for v in m.vertices)
metrics['bounds']={'min':[min(p[i] for p in allpoints) for i in range(3)],'max':[max(p[i] for p in allpoints) for i in range(3)]}
# Runnable geometry checks: only the four authored cover footprints obstruct the floor.
for x,y,z in allpoints:
    cover=abs(abs(x)-18)<=3.001 and abs(abs(z)-18)<=3.001
    assert not (y>.08 and x*x+z*z<42.5*42.5 and not cover),('unplanned combat floor obstruction',x,y,z)
    if .08<y<2.1 and max(abs(x),abs(z))>45:
        assert min(abs(x),abs(z))>=7.999,('cardinal entrance obstruction',x,y,z)
for folder in [SOURCE.parent,EXPORT.parent]:folder.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)

# Retained studio scene: muted woodland ground and a warm elevated southeast view.
def aim(obj,point):obj.rotation_euler=(Vector(xyz(*point))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=500,location=(0,0,-.23));ground=bpy.context.object;ground.name='Preview ground - excluded from runtime'
mat=bpy.data.materials.new('Preview woodland');mat.diffuse_color=(.055,.075,.045,1);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.055,.075,.045,1);mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.95;ground.data.materials.append(mat)
bpy.ops.object.camera_add(location=xyz(48,90,67));camera=bpy.context.object;camera.name='Preview camera';camera.data.type='ORTHO';camera.data.ortho_scale=175;aim(camera,(0,3.2,0));scene.camera=camera
for location,power,size,color in [((-35,55,40),33000,32,(1,.86,.65)),((36,32,7),18000,28,(.70,.85,1))]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*location));light=bpy.context.object;light.data.energy=power*5;light.data.shape='DISK';light.data.size=size*2.5;light.data.color=color;aim(light,(0,2,0))
bpy.ops.object.light_add(type='SUN',location=xyz(-25,60,30));sun=bpy.context.object;sun.data.energy=1.8;sun.data.angle=.12;aim(sun,(0,0,0))
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.16,.21,.24,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
scene.render.engine='CYCLES';scene.cycles.samples=28;scene.cycles.max_bounces=5;scene.cycles.use_denoising=True
scene.render.resolution_x=1800;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(PREVIEW);scene.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
metrics['bytes']=EXPORT.stat().st_size;print('COLOSSEUM_ASSET '+json.dumps(metrics),flush=True)
if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
