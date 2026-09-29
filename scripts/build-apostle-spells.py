"""Author the Apostle's void spell silhouettes in Blender.
Blender --background --disable-autoexec --python scripts/build-apostle-spells.py -- --render
Geometry is authored in gameplay Y-up coordinates and converted once for Blender.
"""
import bpy, math, subprocess, sys, tempfile
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/apostle-spells.glb'
SOURCE=ROOT/'assets/source/horned-apostle/apostle-spells.blend'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.name='Apostle — carved void spell kit'
C={'void':(.018,.009,.038,1),'obsidian':(.045,.021,.075,1),'plate':(.105,.045,.17,1),
   'edge':(.22,.09,.35,1),'violet':(.32,.085,.68,1),'lilac':(.60,.34,.92,1),
   'cyan':(.10,.72,.92,1),'ice':(.47,.82,1,1),'rift':(.17,.05,.32,1)}
materials=[]
for name,emission,roughness in [('Void carved obsidian',0,.42),('Void luminous runes',1.7,.33)]:
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=roughness
    shader.inputs['Metallic'].default_value=.35 if not emission else .1
    tint=mat.node_tree.nodes.new('ShaderNodeVertexColor');tint.layer_name='VoidTint'
    mat.node_tree.links.new(tint.outputs['Color'],shader.inputs['Base Color'])
    if emission:
        mat.node_tree.links.new(tint.outputs['Color'],shader.inputs['Emission Color']);shader.inputs['Emission Strength'].default_value=emission
    materials.append(mat)
roots={};buffers={};current='';bucket_override=None

def begin(name):
    global current,buffers
    current='apostle-spell-'+name;buffers={}

def geo(vertices,faces,color='obsidian',material=0,bucket=None):
    key=bucket or bucket_override or ('runes' if material else 'carved')
    data=buffers.setdefault((key,material),[[],[],[]]);offset=len(data[0])
    data[0].extend(tuple(v) for v in vertices);data[1].extend(tuple(offset+i for i in f) for f in faces);data[2].extend([C[color]]*len(faces))

def tube(points,radius,color='edge',material=0,sides=6,bucket=None):
    pts=[Vector(p) for p in points];vertices=[];faces=[]
    for i,p in enumerate(pts):
        tangent=(pts[min(i+1,len(pts)-1)]-pts[max(i-1,0)]).normalized()
        cross=tangent.cross(Vector((0,1,0)))
        if cross.length<.001:cross=tangent.cross(Vector((0,0,1)))
        u=cross.normalized();v=tangent.cross(u).normalized();r=radius[i] if isinstance(radius,list) else radius
        for j in range(sides):vertices.append(p+r*(u*math.cos(j*math.tau/sides)+v*math.sin(j*math.tau/sides)))
    for i in range(len(pts)-1):
        for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces.extend([tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+j for j in range(sides))]);geo(vertices,faces,color,material,bucket)

def ring(center,radius,tube_radius,color='edge',material=0,plane='xz',segments=32,start=0,arc=math.tau,bucket=None):
    c=Vector(center)
    def pt(a):
        x,z=math.cos(a)*radius,math.sin(a)*radius
        return c+Vector((x,0,z) if plane=='xz' else (x,z,0) if plane=='xy' else (0,x,z))
    tube([pt(start+i*arc/segments) for i in range(segments+1)],tube_radius,color,material,5,bucket)

def gem(center,size,color='violet',material=1,bucket=None):
    x,y,z=center;a,b,c=size
    geo([(x-a,y,z),(x+a,y,z),(x,y-b,z),(x,y+b,z),(x,y,z-c),(x,y,z+c)],[(0,2,4),(2,1,4),(1,3,4),(3,0,4),(2,0,5),(1,2,5),(3,1,5),(0,3,5)],color,material,bucket)

def ellipsoid(center,size,color='obsidian',material=0,segments=12,rings=7,bucket=None):
    center=Vector(center);vertices=[]
    for i in range(rings+1):
        phi=math.pi*i/rings
        for j in range(segments):
            a=math.tau*j/segments;vertices.append(center+Vector((size[0]*math.sin(phi)*math.cos(a),size[1]*math.cos(phi),size[2]*math.sin(phi)*math.sin(a))))
    faces=[]
    for i in range(rings):
        for j in range(segments):faces.append((i*segments+j,i*segments+(j+1)%segments,(i+1)*segments+(j+1)%segments,(i+1)*segments+j))
    geo(vertices,faces,color,material,bucket)

def plate(points,depth=.10,color='plate',material=0,plane='xz',offset=0,bucket=None):
    n=len(points)
    def v(p,d):return (p[0],offset+d,p[1]) if plane=='xz' else (p[0],p[1],offset+d)
    vertices=[v(p,-depth/2) for p in points]+[v(p,depth/2) for p in points]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    geo(vertices,faces,color,material,bucket)

def rune(center,size=.2,angle=0,plane='xz',color='cyan',variant=0):
    glyphs=[[(0,-.5),(0,.5),(-.35,.2),(0,0),(.35,.28)], [(-.35,-.4),(.35,.4),(-.1,.4),(.2,-.4)], [(-.4,0),(0,.5),(.4,0),(0,-.5),(-.4,0)]]
    c=Vector(center)
    def v(p):
        x=(p[0]*math.cos(angle)-p[1]*math.sin(angle))*size;z=(p[0]*math.sin(angle)+p[1]*math.cos(angle))*size
        return c+Vector((x,0,z) if plane=='xz' else (x,z,0))
    tube([v(p) for p in glyphs[variant%3]],size*.043,color,1,4)

def finish(description,pivot):
    root=bpy.data.objects.new(current,None);scene.collection.objects.link(root);roots[current]=root
    root['description']=description;root['axes']='Y-up; +Z front; metres';root['pivot']=pivot
    for (label,mat),(vertices,faces,colors) in buffers.items():
        mesh=bpy.data.meshes.new(current+'-'+label);mesh.from_pydata([(x,-z,y) for x,y,z in vertices],[],faces);mesh.update()
        obj=bpy.data.objects.new(current+'-'+label,mesh);scene.collection.objects.link(obj);obj.parent=root;mesh.materials.append(materials[mat])
        tint=mesh.color_attributes.new(name='VoidTint',type='BYTE_COLOR',domain='CORNER')
        for face,color in zip(mesh.polygons,colors):
            for i in face.loop_indices:tint.data[i].color=color
    return root

# An articulated spectral palm: carpal plates, separate knuckles, joint bands,
# tapered phalanges, split nails and inset angular inscriptions. Fingers point +Z.
begin('palm')
plate([(-.85,-1.7),(.85,-1.7),(1.05,-.7),(.92,.75),(.55,1.04),(-.64,1.0),(-1.02,.55),(-1.05,-.7)],.30,'obsidian',offset=.04)
for side in [-1,1]:
    plate([(side*.12,-1.5),(side*.75,-1.4),(side*.84,-.35),(side*.58,.55),(side*.12,.75)],.14,'plate',offset=.25)
    tube([(side*.73,.28,-1.55),(side*.91,.29,-.65),(side*.75,.31,.65)],.035,'lilac',1)
for i,z in enumerate([-1.38,-1.05,-.7]):
    tube([(-.84,.26,z),(0,.32,z-.07),(.84,.26,z)],.043,'edge')
    rune((0,.35,z),.20,variant=i)
ring((0,.34,.03),.56,.095,'edge',segments=24)
ring((0,.43,.03),.38,.028,'cyan',1,segments=24)
for i in range(8):
    a=i*math.tau/8;gem((math.cos(a)*.55,.44,.03+math.sin(a)*.55),(.063,.07,.063),'violet',1)
rune((0,.47,.03),.56,color='lilac',variant=2)
finger_specs=[(-.75,2.54,-.18),(-.27,3.02,-.06),(.25,2.86,.07),(.73,2.34,.20)]
for finger,(x,length,splay) in enumerate(finger_specs):
    start=Vector((x,.08,.68));end=Vector((x+splay,.08,length));step=(end-start)/3
    for segment in range(3):
        a=start+step*segment;b=start+step*(segment+.84);mid=(a+b)/2;radius=.18-segment*.025
        tube([a,b],[radius,radius*.85],'plate',0,8)
        ellipsoid(a,(radius*1.12,.21,radius*1.1),'edge',segments=8,rings=4)
        tube([a+Vector((-.10,.16,0)),mid+Vector((0,.2,0)),b+Vector((.08,.15,0))],.021,'cyan' if segment==1 else 'violet',1,4)
        for lateral in [-1,1]:tube([a+Vector((lateral*radius,.05,.02)),b+Vector((lateral*radius*.85,.05,-.01))],.019,'edge',0,4)
        if segment<2:gem(mid+Vector((0,.23,0)),(.055,.036,.11),'lilac',1)
    tip=end+Vector((0,0,.23));plate([(end.x-.14,end.z-.24),(end.x+.14,end.z-.24),(tip.x,tip.z)],.08,'edge',offset=.22)
    tube([(end.x,.275,end.z-.20),(tip.x,.275,tip.z-.04)],[.022,.005],'lilac',1,4)
# Opposable thumb curls away from the palm rather than forming a fifth straight rod.
thumb=[(-.83,.05,-.5),(-1.37,.10,-.05),(-1.58,.15,.53),(-1.78,.18,.83)]
for i,(a,b) in enumerate(zip(thumb,thumb[1:])):
    tube([a,b],[.23-i*.045,.18-i*.035],'plate',0,8);ellipsoid(a,(.22,.23,.24),'edge',segments=8,rings=4)
    tube([Vector(a)+Vector((0,.2,0)),Vector(b)+Vector((0,.17,0))],.023,'violet',1,4)
gem((-1.80,.21,.87),(.10,.10,.21),'lilac',1)
finish('Jointed void gauntlet with four segmented fingers, opposed thumb, nail blades and a carved palm sigil.','Palm center; flat XZ, fingers +Z.')

# A collapsing star has separately addressable solid core, fracture shards and rune inlays.
begin('star')
ellipsoid((0,0,0),(.33,.33,.33),'void',segments=10,rings=5,bucket='core')
for i in range(8):
    a=i*math.tau/8;r=1.18 if i%2==0 else .87
    def p(rad,offset=0):return (math.cos(a+offset)*rad,math.sin(a+offset)*rad)
    plate([p(.42,-.18),p(r,0),p(.42,.18),p(.30,0)],.18 if i%2==0 else .13,'plate',plane='xy',bucket='shards')
    tube([(p(.46)[0],p(.46)[1],.13),(p(r*.86)[0],p(r*.86)[1],.13)],[.032,.007],'lilac' if i%2 else 'cyan',1,4,bucket='runes')
    gem((p(.47)[0],p(.47)[1],.1),(.10,.10,.12),'violet',1,bucket='runes')
    for step in range(2 if i%2 else 3):
        radius=.49+step*.14
        tube([(p(radius,-.085)[0],p(radius,-.085)[1],.12),(p(radius+.05)[0],p(radius+.05)[1],.15),(p(radius,.085)[0],p(radius,.085)[1],.12)],.012,'cyan' if i%2==0 else 'violet',1,4,bucket='runes')
    rune((p(.65)[0],p(.65)[1],.15),.14,a,'xy',color='lilac',variant=i)
    if i%2==0:gem((p(.77,.18)[0],p(.77,.18)[1],0),(.055,.10,.06),'edge',0,bucket='shards')
ring((0,0,.015),.385,.028,'violet',1,'xy',24,bucket='runes')
finish('Eight split obsidian star rays orbit a solid void heart; core, shards and runes remain separate meshes.','Center; upright XY, radius 1.2.')

# Three ragged crescent blades, each with a raised spine and fractured luminous edge.
begin('claws')
for j in range(3):
    x=(j-1)*.95;shift=abs(j-1)*.30
    outline=[(x-.14,-2.12+shift),(x-.32,-1.6+shift),(x-.48,-.7+shift),(x-.40,.38+shift),(x-.16,1.12+shift),(x+.37,2.05+shift),(x+.27,.92+shift),(x+.06,.4+shift),(x+.20,.16+shift),(x-.02,-.10+shift),(x+.12,-.45+shift),(x-.05,-.88+shift)]
    plate(outline,.14,'plate',offset=.04)
    tube([(x-.15,.12,-1.98+shift),(x-.31,.21,-1.2+shift),(x-.29,.25,-.28+shift),(x-.07,.19,.83+shift),(x+.33,.12,1.99+shift)],[.08,.13,.10,.075,.002],'edge',0,5)
    tube([(x-.26,.19,-1.55+shift),(x-.37,.20,-.71+shift),(x-.24,.22,.14+shift),(x+.0,.18,.92+shift),(x+.34,.11,2.02+shift)],[.020,.035,.036,.025,.001],'cyan' if j==1 else 'lilac',1,4)
    for n in range(4):gem((x-.26+n*.03,.23,-1.2+n*.55+shift),(.055,.035,.08),'violet',1)
    for n in range(5):
        z=-1.35+n*.55+shift
        tube([(x-.15,.18,z-.08),(x-.30,.24,z),(x-.21,.25,z+.10)],.017,'lilac' if n%2 else 'violet',1,4)
        plate([(x-.28,z-.09),(x-.14,z+.04),(x-.25,z+.19)],.035,'edge',offset=.20)
finish('Three torn scythe claws with raised obsidian spines, chipped edges and luminous split veins.','Centered footprint; flat XZ, blades sweep toward +Z.')

# One serrated feather can be instanced into full wing fans, shadow waves and trails.
begin('feather')
plate([(-.10,0),(-.23,.28),(-.37,.50),(-.26,.61),(-.40,.79),(-.27,.91),(-.34,1.17),(-.20,1.26),(-.20,1.56),(0,2),(.18,1.52),(.13,1.38),(.29,1.13),(.20,1.03),(.34,.80),(.23,.68),(.30,.43),(.17,.29),(.09,0)],.065,'plate')
tube([(0,.065,.03),(0,.13,.75),(0,.11,1.4),(0,.05,1.96)],[.09,.064,.035,.003],'edge',0,6)
for side in [-1,1]:
    for i in range(6):
        z=.24+i*.22;width=(.23 if i<4 else .15)*side
        tube([(0,.12,z),(width*.55,.12,z+.11),(width,.075,z+.17)],[.018,.025,.003],'violet' if i%2 else 'cyan',1,4)
for z in [.35,.85,1.30]:rune((0,.15,z),.14,variant=1,color='lilac')
finish('Layered torn feather with serrated vanes, a raised central quill and branching void veins.','Base; flat XZ, length two along +Z.')

# Eclipse corona is solid, faceted and layered, with blades instead of a simple glowing sphere.
begin('eclipse')
ellipsoid((0,0,0),(1,1,1),'void',segments=24,rings=14)
for r,thick,color,mat in [(1.035,.025,'cyan',1),(1.13,.075,'plate',0),(1.25,.025,'violet',1),(1.36,.045,'edge',0)]:ring((0,0,0),r,thick,color,mat,'xy',48)
for i in range(24):
    a=i*math.tau/24;r=1.66 if i%3==0 else 1.48
    def p(rad,offset=0):return (math.cos(a+offset)*rad,math.sin(a+offset)*rad)
    plate([p(1.12,-.055),p(r,.09),p(1.22,.055)],.08,'plate',plane='xy')
    gem((p(1.16)[0],p(1.16)[1],.08),(.055,.055,.06),'cyan' if i%3==0 else 'lilac',1)
    if i%2==0:rune((p(1.33)[0],p(1.33)[1],.07),.13,a,'xy',variant=i)
for i in [-1,1]:
    tube([(.05*i,-.94,.35),(.23*i,-.51,.86),(.08*i,-.22,.98),(.30*i,.13,.94),(.19*i,.52,.83),(.10*i,.94,.35)],.016,'violet',1,4)
finish('Faceted black eclipse with concentric carved coronas, curved thorn rays and violet fault seams.','Center; upright XY corona radius 1.7, orb radius one.')

# Torn spiral ribbons and orbiting fragments make a visible inward soul current.
begin('vortex')
for strand in range(3):
    verts=[];faces=[]
    for i in range(49):
        t=i/48;a=t*math.tau*1.85+strand*math.tau/3;r=1.43*(1-t)+.12;y=3*t
        width=.18*(1-t)+.025
        for height in [-.009,.009]:
            for offset in [-1,1]:
                rr=r+offset*width;verts.append((math.cos(a)*rr,y+offset*.075+height,math.sin(a)*rr))
    for i in range(48):
        n=i*4;m=n+4
        faces.extend([(n,m,m+1,n+1),(n+2,n+3,m+3,m+2),(n,n+2,m+2,m),(n+1,m+1,m+3,n+3)])
    faces.extend([(0,1,3,2),(192,194,195,193)])
    geo(verts,faces,'rift')
    pts=[]
    for i in range(49):
        t=i/48;a=t*math.tau*1.85+strand*math.tau/3;r=1.43*(1-t)+.12
        pts.append((math.cos(a)*r,3*t+.035,math.sin(a)*r))
    tube(pts,[.035*(1-i/48)+.005 for i in range(49)],'cyan' if strand==0 else 'violet',1,4)
for i in range(18):
    t=i/18;a=t*math.tau*2.2;r=1.32*(1-t)+.16
    gem((math.cos(a)*r,3*t,math.sin(a)*r),(.05,.11,.045),'lilac' if i%3==0 else 'edge',1 if i%3==0 else 0)
ring((0,.04,0),1.4,.024,'violet',1,segments=40)
finish('Three torn helical ribbons, descending shards and bright veins form an inward soul-harvest current.','Ground center; Y-up, height three and radius about 1.65.')

# A separate skull motif is light enough to instance along the harvest strands.
begin('soul')
ellipsoid((0,.1,0),(.30,.36,.24),'plate',segments=12,rings=7)
ellipsoid((0,-.17,.015),(.21,.17,.17),'obsidian',segments=10,rings=4)
for side in [-1,1]:
    ellipsoid((side*.12,.15,.214),(.085,.092,.037),'void',segments=8,rings=4)
    gem((side*.12,.15,.242),(.028,.034,.015),'cyan',1)
    tube([(side*.05,.24,.22),(side*.16,.29,.20),(side*.25,.20,.15)],.034,'edge',0,5)
    tube([(side*.24,.04,.17),(side*.20,-.08,.19),(side*.10,-.14,.19)],.027,'lilac',1,4)
    tube([(side*.18,-.15,-.01),(side*.28,-.30,-.07),(side*.13,-.46,-.03),(side*.10,-.58,-.14)],[.06,.047,.029,.001],'violet',1,5)
for i in range(5):
    x=(i-2)*.06;plate([(x-.021,-.14),(x+.021,-.14),(x+.018,-.26),(x-.016,-.25)],.06,'edge',plane='xy',offset=.175)
plate([(-.05,.04),(.05,.04),(0,-.055)],.025,'void',plane='xy',offset=.247)
rune((0,.37,.135),.15,plane='xy',color='lilac',variant=2)
finish('A carved spectral skull with hollow eyes, split teeth, angular cheekbones and two trailing soul wisps.','Center; front +Z, roughly one metre tall.')

# Clone rift: an open ragged almond, split collar plates and displaced inward shards.
begin('rift')
for side in [-1,1]:
    pts=[(side*.04,-2,0),(side*.58,-1.40,.05),(side*1.08,-.40,0),(side*1.12,.30,.03),(side*.68,1.35,0),(side*.03,2,0)]
    tube(pts,[.02,.11,.15,.13,.10,.01],'plate',0,7)
    tube([(x*.88,y*.98,z+.09) for x,y,z in pts],[.004,.023,.035,.027,.022,.002],'cyan' if side==-1 else 'lilac',1,5)
    for i in range(7):
        y=-1.45+i*.47;x=side*(1.08*(1-(y/2.2)**2))
        plate([(x,y-.20),(x+side*.24,y+.06),(x+side*.10,y+.27),(x-side*.11,y+.1)],.12,'edge',plane='xy')
        rune((x,y,.09),.16,.2*side,'xy',color='violet',variant=i)
        if i%2==0:gem((x*.66,y*.93,.03),(.075,.16,.06),'lilac',1)
for y in [-1.65,1.65]:ring((0,y,0),.18,.04,'edge',0,'xy',16)
finish('Open clone rift with a ragged almond silhouette, fractured collar armor and inward-floating shards.','Center; upright XY, height four.')

# One ornate link; half-twist accents and binding studs retain its interlocking identity.
begin('chain')
pts=[]
for i in range(33):
    a=i*math.tau/32;pts.append((.18*math.cos(a),.28*math.sin(a),0))
tube(pts,.056,'edge',0,8)
for side in [-1,1]:
    tube([(side*.12,-.20,.049),(side*.18,-.08,.06),(side*.18,.08,.06),(side*.12,.20,.049)],.012,'cyan',1,4)
    gem((0,side*.29,0),(.07,.055,.079),'plate',0)
    gem((0,side*.29,.079),(.022,.020,.018),'violet',1)
for side in [-1,1]:
    tube([(side*.18,-.085,-.055),(side*.18,-.06,.066),(side*.18,-.02,.073),(side*.18,.02,-.055)],.018,'plate',0,5)
finish('A forged oval chain link with interlocking relief, bound collars, luminous inlays and socket studs.','Center; upright XY, long axis Y; alternate instances rotated around Y form a chain.')

# Flat ring uses broken bands and twenty-four individually engraved glyph sockets.
begin('rune-ring')
for r,width,mat,color in [(.97,.025,0,'edge'),(.88,.014,1,'violet'),(.71,.025,0,'plate'),(.62,.014,1,'cyan')]:ring((0,0,0),r,width,color,mat,segments=64)
for i in range(24):
    a=i*math.tau/24;r=.80;x,z=math.cos(a)*r,math.sin(a)*r
    rune((x,.035,z),.13,a,'xz','lilac' if i%3==0 else 'violet',i)
    if i%3==0:
        tube([(math.cos(a)*.61,.018,math.sin(a)*.61),(math.cos(a)*.98,.018,math.sin(a)*.98)],.012,'edge',0,4)
        gem((math.cos(a)*.97,.025,math.sin(a)*.97),(.033,.035,.033),'cyan',1)
for i in range(4):
    a=i*math.tau/4+math.pi/4;gem((math.cos(a)*.50,.03,math.sin(a)*.50),(.05,.035,.05),'violet',1)
finish('Four nested sigil bands with twenty-four runes, radial sockets and alternating fractured junctions.','Center; flat XZ, radius one.')

# Upright portal crown frames the transition without filling the readable opening.
begin('portal-crown')
for r,width,color,mat in [(1.04,.045,'plate',0),(1.14,.015,'cyan',1),(1.27,.055,'edge',0)]:ring((0,0,0),r,width,color,mat,'xy',48)
for i in range(16):
    a=i*math.tau/16
    def p(r,o=0):return (math.cos(a+o)*r,math.sin(a+o)*r)
    plate([p(1.18,-.07),p(1.49,.03),p(1.28,.09)],.11,'plate',plane='xy')
    gem((p(1.26)[0],p(1.26)[1],.09),(.055,.055,.045),'lilac' if i%2 else 'cyan',1)
    rune((p(1.10)[0],p(1.10)[1],.08),.13,a,'xy','violet',i)
for i in range(4):
    a=i*math.tau/4
    ring((math.cos(a)*1.27,math.sin(a)*1.27,.08),.115,.026,'edge',0,'xy',16)
finish('A hollow portal crown of sixteen swept obsidian blades, bound gems and nested transition runes.','Center; upright XY, radius one and a half.')

OUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
with tempfile.TemporaryDirectory(prefix='apostle-spells-') as tmp:
    cli=['npx','--yes','@gltf-transform/cli@4.5.0'];dedup=str(Path(tmp)/'dedup.glb');pruned=str(Path(tmp)/'pruned.glb')
    subprocess.run(cli+['dedup',str(OUT),dedup],check=True);subprocess.run(cli+['prune',dedup,pruned,'--keep-leaves','true'],check=True)
    subprocess.run(cli+['quantize',pruned,str(OUT)],check=True)
def save_inspection_source():
    # Actual authored objects, arranged after export so runtime origins stay untouched.
    names=list(roots)
    for i,name in enumerate(names):
        obj=roots[name];col=i%4;row=i//4;obj.location=((col-1.5)*7,0,(2-row)*6.9)
        short=name.replace('apostle-spell-','')
        if short in ['palm','claws','feather','rune-ring']:obj.rotation_euler=(math.pi/2,math.pi,0)
        if short=='palm':obj.scale=(.82,.82,.82)
        if short=='chain':obj.scale=(3.3,3.3,3.3)
        if short=='soul':obj.scale=(2.7,2.7,2.7)
        if short=='feather':obj.scale=(1.65,1.65,1.65)
        if short=='vortex':obj.location.z-=1.0;obj.rotation_euler.x=.15
        data=bpy.data.curves.new('Label '+short,'FONT');data.body=short.replace('-',' ').upper();data.align_x='CENTER';data.size=.29
        label=bpy.data.objects.new('Label '+short,data);scene.collection.objects.link(label);label.location=((col-1.5)*7,-2.5,(2-row)*6.9-2.8);label.rotation_euler=(math.pi/2,0,0)
        mat=bpy.data.materials.get('Inspection labels')
        if not mat:mat=bpy.data.materials.new('Inspection labels');mat.diffuse_color=(.6,.68,.85,1)
        data.materials.append(mat)
    world=bpy.data.worlds.new('Void kit inspection');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.014,.047,1);world.node_tree.nodes['Background'].inputs[1].default_value=.8;scene.world=world
    bpy.ops.object.camera_add(location=(0,-45,7.8));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,7.8))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=29;scene.camera=camera
    for name,loc,power,size,color in [('Key',(-9,-10,20),5500,16,(.69,.71,1)),('Fill',(12,-9,6),4300,12,(.32,.68,1)),('Rim',(0,5,14),4500,12,(.60,.24,1))]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color;light=bpy.data.objects.new(name,data);scene.collection.objects.link(light);light.location=loc;light.rotation_euler=(Vector((0,0,8))-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.resolution_x=1920;scene.render.resolution_y=1440;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.render.filepath=str(SOURCE.with_name('apostle-spells-preview.png'))
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':
            view=area.spaces.active;view.region_3d.view_perspective='ORTHO';view.region_3d.view_location=(0,0,7.8);view.region_3d.view_distance=31;view.region_3d.view_rotation=camera.rotation_euler.to_quaternion();view.shading.type='MATERIAL'
    bpy.ops.object.select_all(action='DESELECT');bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
save_inspection_source()
print('APOSTLE_SPELLS_EXPORT',OUT,OUT.stat().st_size,'bytes;',len(roots),'void motifs; two shared vertex palettes; no textures/decoders')
