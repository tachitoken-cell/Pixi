"""Blender-authored Wayfinder Sprite. Run with Blender --background --python this.py -- --render.

Editable rigid parts, three vertex-color materials, metres/Y-up/+Z-forward GLB.
The stepped solids use the same carved exterior-face method as build-wild-pet-assets.py.
"""
import bpy
import json
import math
import struct
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/wayfinder-sprite.blend'
EXPORT = ROOT / 'public/models/wayfinder-sprite.glb'
PREVIEW = ROOT / 'assets/source/wayfinder-sprite-preview.png'
ICON = ROOT / 'public/ui/pets/wayfinder-sprite.png'
TAU = math.tau
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

PALETTE = {'ink':'162C2B', 'cream':'F2DEAD', 'pale':'FFF2D0', 'wood':'987340',
           'bark':'59452E', 'jade':'28766A', 'moss':'4E8A57', 'fern':'8DBD73',
           'mint':'9EE0B8', 'teal':'145859', 'deep':'163F42', 'gold':'DDA64A',
           'lightgold':'FFE09A', 'bronze':'887038', 'amber':'FFAD32', 'glow':'FFDC78',
           'white':'FFFFEA', 'rose':'D58768'}
def linear(v): return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
COLORS = {k: tuple(linear(int(v[i:i+2], 16) / 255) for i in (0, 2, 4)) + (1,) for k,v in PALETTE.items()}
def xyz(p): return (p[0], -p[2], p[1])
parts = {}
active = ''
def part(name, pivot=(0,0,0), parent=None):
    global active
    active = name
    parts[name] = {'pivot':Vector(pivot), 'parent':parent, 'verts':[], 'faces':[], 'colors':[], 'mats':[]}
def shape(tint, verts, faces, metal=False, glow=False):
    p = parts[active]; offset = len(p['verts'])
    p['verts'].extend(tuple(Vector(v)-p['pivot']) for v in verts)
    p['faces'].extend(tuple(offset+i for i in f) for f in faces)
    p['colors'].extend([COLORS[tint]] * len(faces)); p['mats'].extend([2 if glow else 1 if metal else 0] * len(faces))
def block(tint, c, half, metal=False, glow=False):
    verts = [tuple(c[j]+p[j]*half[j] for j in range(3)) for p in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    shape(tint, verts, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)], metal, glow)
def solid(tint, c, radii, detail=10, metal=False, glow=False):
    unit=max(.007, max(radii)*2/detail)
    dims=[max(1, math.ceil(r*2/unit)) for r in radii]
    cells={(x,y,z) for x in range(dims[0]) for y in range(dims[1]) for z in range(dims[2])
           if sum(((v+.5)*2/d-1)**2 for v,d in zip((x,y,z),dims))<=1}
    verts=[]; faces=[]
    for axis in range(3):
        u=(axis+1)%3; v=(axis+2)%3
        for direction in (-1,1):
            for layer in range(dims[axis]):
                mask=set()
                for cell in cells:
                    if cell[axis]!=layer: continue
                    neighbor=list(cell); neighbor[axis]+=direction
                    if tuple(neighbor) not in cells: mask.add((cell[u],cell[v]))
                while mask:
                    x,y=min(mask,key=lambda p:(p[1],p[0])); w=1; h=1
                    while (x+w,y) in mask: w+=1
                    while all((x+i,y+h) in mask for i in range(w)): h+=1
                    mask.difference_update((x+i,y+j) for i in range(w) for j in range(h))
                    n=len(verts)
                    for a,b in ((x,y),(x+w,y),(x+w,y+h),(x,y+h)):
                        p=[0,0,0]; p[axis]=layer+(direction>0); p[u]=a; p[v]=b
                        verts.append(tuple(c[j]+(p[j]*2/dims[j]-1)*radii[j] for j in range(3)))
                    faces.append(tuple(n+i for i in ((0,1,2,3) if direction>0 else (3,2,1,0))))
    shape(tint,verts,faces,metal,glow)
def tube(tint, points, radii, metal=False, glow=False, sides=4):
    points=[Vector(p) for p in points]; verts=[]
    if isinstance(radii,(int,float)): radii=[radii]*len(points)
    for i,p in enumerate(points):
        d=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        ref=Vector((0,0,1)) if abs(d.z)<.9 else Vector((0,1,0))
        a=d.cross(ref).normalized(); b=d.cross(a).normalized()
        verts.extend(tuple(p+radii[i]*(a*math.cos(TAU*j/sides)+b*math.sin(TAU*j/sides))) for j in range(sides))
    faces=[tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))]
    faces.extend((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j) for i in range(len(points)-1) for j in range(sides))
    shape(tint,verts,faces,metal,glow)
def leaf(tint, a, b, width, thick=.009, metal=False, vein=False):
    a=Vector(a); b=Vector(b); d=b-a; side=d.cross(Vector((0,0,1))).normalized()*width/2
    normal=side.cross(d).normalized()*thick
    for i,profile in enumerate((.38,.72,1,.86,.53,.21)):
        c=a+d*(i+.5)/6
        verts=[c+side*x*profile+d*y/12+normal*z for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        shape(tint,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],metal)
    if vein:
        front=Vector((0,0,thick+.003))
        tube('lightgold' if metal else 'fern',[a+front,b+front],[.0025,.0007],metal)
def plate(tint, outline, z, thick=.009, metal=False, glow=False, back_tint=None):
    if sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(outline,outline[1:]+outline[:1]))<0: outline=list(reversed(outline))
    n=len(outline); verts=[(x,y,z+d*thick) for d in (-1,1) for x,y in outline]
    back_face=len(parts[active]['faces'])
    shape(tint,verts,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],metal,glow)
    if back_tint: parts[active]['colors'][back_face]=COLORS[back_tint]
def ring(tint,c,rx,ry,r=.007,metal=False):
    tube(tint,[(c[0]+rx*math.cos(TAU*i/32),c[1]+ry*math.sin(TAU*i/32),c[2]) for i in range(33)],r,metal)
def compass(c,r,points=8):
    ring('gold',c,r,r,.004,True)
    for i in range(points):
        angle=TAU*i/points; length=r*(.82 if i%2==0 else .55); wide=r*.15
        dx,dy=math.sin(angle),math.cos(angle); sx,sy=dy*wide,-dx*wide
        plate('lightgold' if i%2==0 else 'gold',[(c[0]+sx,c[1]+sy),(c[0]+dx*length,c[1]+dy*length),(c[0]-sx,c[1]-sy)],c[2]+.004,.002,True)
    solid('mint',c,(r*.14,r*.14,.006),6,glow=True)
def eye(x,y,z):
    def tile(tint,w,h,front):
        plate(tint,[(x-w*.7,y-h),(x+w*.7,y-h),(x+w,y-h*.7),(x+w,y+h*.7),(x+w*.7,y+h),(x-w*.7,y+h),(x-w,y+h*.7),(x-w,y-h*.7)],front,.003)
    tile('deep',.055,.058,z);tile('pale',.047,.050,z+.005);tile('jade',.034,.042,z+.009)
    tile('ink',.022,.034,z+.013)
    block('white',(x-.012,y+.017,z+.020),(.009,.010,.003))
    block('mint',(x+.010,y-.021,z+.019),(.005,.004,.002))

# The body reads as a small woodland keeper, with a split layered mantle and carved boots.
part('body')
solid('jade',(0,.305,-.004),(.123,.208,.103),12)
solid('cream',(0,.304,.094),(.087,.149,.044),10)
for side in (-1,1):
    tube('wood',[(side*.075,.16,0),(side*.082,.055,.014)],[.025,.023])
    solid('bark',(side*.087,.028,.032),(.052,.028,.075),8)
    block('gold',(side*.087,.045,.090),(.023,.009,.009),True)
    for row in range(4):
        for j in range(3):
            x=side*(.053+j*.036); y=.49-row*.075; z=.112-j*.025
            leaf(['jade','moss','teal','fern'][(row+j)%4],(x,y,z),(x*1.25,y-.122,z+.009),.073,.013,vein=True)
    # Shoulder clasps and small cuff ornaments are actual modeled geometry.
    solid('gold',(side*.137,.471,.040),(.032,.026,.036),6,True)
    tube('bark',[(side*.14,.45,.04),(side*.205,.34,.085),(side*.246,.31,.152)],[.028,.026,.023])
    solid('cream',(side*.243,.308,.158),(.032,.030,.025),8)
    ring('gold',(side*.220,.325,.136),.027,.030,.004,True)
# The follow-camera sees the back often; the mantle wraps all the way around.
for row in range(4):
    for j in range(9):
        angle=math.pi*(1+j/8);x=.119*math.cos(angle);z=.098*math.sin(angle)-.014;y=.481-row*.074
        leaf(['teal','jade','moss'][(row+j)%3],(x,y,z),(x*1.28,y-.121,z*1.30),.059,.012)
ring('bronze',(0,.407,.144),.059,.063,.011,True)
compass((0,.407,.159),.046)
for j in range(8):
    y=.18+j*.027
    tube('wood',[(-.035,y,.145),(.028,y-.012,.145)],.0024)

# A real carried lantern rather than an illuminated abdomen, with cage, cap and handle.
lx=.292
ring('gold',(lx,.287,.165),.046,.057,.009,True)
block('bark',(lx,.212,.165),(.061,.013,.050))
solid('amber',(lx,.144,.165),(.048,.062,.040),8,glow=True)
solid('glow',(lx,.149,.195),(.027,.045,.010),6,glow=True)
for dx in (-.051,.051):
    for dz in (-.040,.040): tube('gold',[(lx+dx,.21,.165+dz),(lx+dx,.078,.165+dz)],.006,True)
block('bronze',(lx,.075,.165),(.063,.012,.049),True)
block('gold',(lx,.222,.165),(.049,.008,.039),True)
leaf('gold',(lx,.242,.165),(lx,.269,.165),.046,.013,True)
for y in (.10,.179): block('gold',(lx,y,.207),(.053,.004,.004),True)
# Folded explorer's map in the left hand.
plate('wood',[(-.313,.355),(-.234,.329),(-.210,.239),(-.290,.262)],.174,.010)
plate('cream',[(-.304,.343),(-.241,.322),(-.220,.253),(-.283,.274)],.186,.003)
tube('jade',[(-.283,.325,.191),(-.249,.305,.191),(-.273,.293,.191),(-.244,.268,.191)],.003)
compass((-.266,.306,.195),.018,4)

# Leaf hood, welcoming eyes, carved smile and a lopsided acorn coronet.
part('head',(0,.516,.012),'body')
solid('moss',(0,.616,.025),(.171,.163,.149),12)
solid('cream',(0,.61,.122),(.144,.128,.100),12)
for side in (-1,1):
    leaf('wood',(side*.125,.645,.086),(side*.239,.690,.025),.094,.021)
    leaf('fern',(side*.142,.654,.102),(side*.224,.686,.058),.064,.008)
    eye(side*.070,.638,.217)
    tube('bark',[(side*.031,.701,.214),(side*.061,.714,.209),(side*.116,.700,.201)],[.009,.011,.007])
    solid('rose',(side*.117,.590,.199),(.022,.013,.004),6)
    for j in range(3):
        leaf('jade' if j%2 else 'fern',(side*.137,.679-j*.043,.088),(side*(.173-j*.006),.598-j*.044,.126),.057,.012,vein=True)
solid('wood',(0,.608,.231),(.021,.014,.014),6)
tube('bark',[(-.030,.567,.211),(0,.557,.222),(.030,.566,.211)],.0035)
for j in range(7):
    x=(j-3)*.041
    leaf('moss' if j%2 else 'jade',(x,.765,.045),(x*.9,.702,.171),.056,.014,vein=True)
ring('bronze',(0,.750,.012),.144,.031,.009,True)
for j in range(10):
    a=TAU*j/10
    solid('gold',(.14*math.cos(a),.750,.10*math.sin(a)+.015),(.012,.015,.012),5,True)
def acorn(x,y,z,size):
    solid('gold',(x,y,z),(size*.70,size,size*.64),10,True)
    solid('bark',(x,y+size*.68,z),(size*.79,size*.40,size*.73),8)
    for row in range(2):
        for j in range(8):
            a=TAU*(j+row*.5)/8
            solid('bronze',(x+size*.70*math.cos(a),y+size*(.48+row*.27),z+size*.65*math.sin(a)),(size*.18,size*.14,size*.16),4,True)
    tube('wood',[(x,y+size,z),(x+.012,y+size*1.40,z-.013)],[.009,.004])
acorn(-.072,.801,.057,.041)
acorn(.075,.785,.037,.031)
tube('bark',[(-.097,.755,-.01),(-.142,.827,-.017),(-.12,.917,-.021),(-.146,.974,-.021)],[.011,.009,.007,.003])
leaf('fern',(-.13,.882,-.015),(-.201,.923,-.005),.069,.010,vein=True)
leaf('jade',(-.124,.923,-.020),(-.076,.973,-.019),.052,.010,vein=True)
solid('glow',(-.147,.980,-.020),(.009,.010,.009),5,glow=True)
leaf('gold',(.075,.798,.058),(.161,.876,.047),.070,.009,True,vein=True)

# Mirrored cutout moth wings. All strips and ornaments merge into each animated wing.
for side,label in [(-1,'left'),(1,'right')]:
    part('wing-'+label,(side*.106,.439,-.080),'body')
    upper=[(.105,.445),(.169,.624),(.284,.713),(.343,.803),(.423,.815),(.461,.871),(.503,.837),(.571,.851),(.641,.798),(.661,.728),(.619,.653),(.545,.624),(.552,.584),(.458,.551),(.439,.512),(.294,.490)]
    lower=[(.116,.435),(.246,.434),(.361,.391),(.449,.377),(.511,.317),(.500,.260),(.539,.219),(.479,.201),(.461,.151),(.391,.182),(.371,.147),(.313,.207),(.250,.232),(.160,.349)]
    for outline in (upper,lower):
        # Rear faces need jade too: deep teal reads nearly black under the game's lights.
        plate('deep',[(side*x,y) for x,y in outline][::side],-.085,.013,back_tint='jade')
        cx=sum(x for x,y in outline)/len(outline); cy=sum(y for x,y in outline)/len(outline)
        inset=[(side*(cx+(x-cx)*.91),cy+(y-cy)*.91) for x,y in outline]
        plate('gold',inset[::side],-.067,.004,True)
        inset=[(side*(cx+(x-cx)*.84),cy+(y-cy)*.84) for x,y in outline]
        plate('jade' if outline is upper else 'teal',inset[::side],-.060,.004)
        for z in (-.051,-.103):
            tube('gold',[(side*x,y,z) for x,y in outline]+[(side*outline[0][0],outline[0][1],z)],.004,True)
    # Large compass discs sit inside the wing; readable from the normal game camera.
    for x,y,r in ((.427,.692,.103),(.353,.291,.066)):
        solid('deep',(side*x,y,-.037),(r*1.05,r*1.05,.009),10)
        compass((side*x,y,-.024),r)
        # Gold silhouettes remain visible on the reverse of the wings.
        compass((side*x,y,-.124),r*.86,4)
    paths=[[(.143,.465),(.260,.555),(.427,.692),(.568,.799)],[(.211,.540),(.308,.677),(.397,.784)],[(.26,.555),(.405,.567),(.551,.628)],[(.149,.431),(.261,.357),(.353,.291),(.461,.197)],[(.261,.357),(.398,.362),(.487,.306)]]
    for path in paths:
        tube('gold',[(side*x,y,-.043) for x,y in path],.004,True)
        tube('bronze',[(side*x,y,-.114) for x,y in path],.0035,True)
        for x,y in path[1:-1]: solid('mint',(side*x,y,-.034),(.010,.010,.007),5,glow=True)
    for x,y in ((.472,.816),(.583,.761),(.582,.682),(.477,.566),(.497,.262),(.391,.204),(.285,.277)):
        block('lightgold',(side*x,y,-.044),(.009,.012,.004),True)
    # A curved vein and a tiny illuminated tip give the silhouette a clear rhythm.
    tube('gold',[(side*.163,.458,-.068),(side*.216,.601,-.061),(side*.299,.697,-.061)],[.010,.007,.003],True)
    solid('mint',(side*.637,.764,-.05),(.011,.014,.008),5,glow=True)

part('tail',(0,.167,-.089),'body')
for j in range(3):
    x=(j-1)*.030
    leaf('teal' if j==1 else 'jade',(x,.17,-.092),(x*1.8,.025,-.138),.055,.010,vein=True)
    solid('gold',(x*1.8,.03,-.122),(.009,.010,.005),5,True)

library=bpy.context.scene; library.name='Wayfinder Sprite - editable asset'
library.unit_settings.system='METRIC'
materials=[]
for name,metal,glow in [('Wayfinder carved color',False,False),('Wayfinder gilded color',True,False),('Wayfinder lantern color',False,True)]:
    mat=bpy.data.materials.new(name); mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF'); shader.inputs['Roughness'].default_value=.38 if metal else .66
    shader.inputs['Metallic'].default_value=.70 if metal else 0
    vertex=mat.node_tree.nodes.new('ShaderNodeVertexColor'); vertex.layer_name='PetTint'
    mat.node_tree.links.new(vertex.outputs['Color'],shader.inputs['Base Color'])
    if glow:
        mat.node_tree.links.new(vertex.outputs['Color'],shader.inputs['Emission Color']);shader.inputs['Emission Strength'].default_value=.65
    materials.append(mat)
root=bpy.data.objects.new('wayfinder-sprite',None); library.collection.objects.link(root)
root['locomotion']='hover';root['groundY']=0;root['title']='WAYFINDER SPRITE'
root['contract']='Metres. GLB Y-up, +Z forward. Rigid joints: head X/Y; wings Z; tail Y.'
joints={}; all_vertices=[]
for label,p in parts.items():
    joint=bpy.data.objects.new('wayfinder-sprite-'+label,None); library.collection.objects.link(joint)
    joint.parent=joints[p['parent']] if p['parent'] else root
    parent_pivot=parts[p['parent']]['pivot'] if p['parent'] else Vector()
    joint.location=xyz(p['pivot']-parent_pivot)
    mesh=bpy.data.meshes.new(joint.name+'-geometry'); mesh.from_pydata([xyz(v) for v in p['verts']],[],p['faces'])
    for material in materials: mesh.materials.append(material)
    color=mesh.color_attributes.new(name='PetTint',type='BYTE_COLOR',domain='CORNER')
    for polygon,tint,material in zip(mesh.polygons,p['colors'],p['mats']):
        polygon.material_index=material
        for loop in polygon.loop_indices: color.data[loop].color=tint
    mesh.update();obj=bpy.data.objects.new(joint.name+'-mesh',mesh);library.collection.objects.link(obj);obj.parent=joint
    joints[label]=joint;all_vertices.extend(Vector(v)+p['pivot'] for v in p['verts'])
root['height']=max(v.y for v in all_vertices); root['width']=max(v.x for v in all_vertices)-min(v.x for v in all_vertices)
root['triangles']=sum(sum(len(f)-2 for f in p['faces']) for p in parts.values())
for path in (SOURCE,EXPORT,PREVIEW,ICON): path.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
raw=EXPORT.read_bytes(); size=struct.unpack_from('<I',raw,12)[0]; document=json.loads(raw[20:20+size])
assert len(document['materials'])==3 and len(document['scenes'][0]['nodes'])==1 and not document.get('images')
assert root['triangles']<25_000 and .8<root['height']<1.1 and 1.1<root['width']<1.5
assert min(v.y for v in all_vertices)>-.001

def aim(obj,at): obj.rotation_euler=(Vector(xyz(at))-obj.location).to_track_quat('-Z','Y').to_euler()
def clone_tree(source,scene):
    obj=source.copy();scene.collection.objects.link(obj)
    for child in source.children: clone_tree(child,scene).parent=obj
    return obj
def plain(name,color,metal=0):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=color
    shader.inputs['Roughness'].default_value=.75;shader.inputs['Metallic'].default_value=metal
    return mat
gallery=bpy.data.scenes.new('Wayfinder Sprite - presentation');bpy.context.window.scene=gallery
gallery.world=bpy.data.worlds.new('Wayfinder studio');gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.16,.24,.23,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
gallery.render.engine='CYCLES';gallery.cycles.samples=24 if '--draft' in sys.argv else 64;gallery.cycles.use_denoising=True
gallery.render.resolution_x=1600;gallery.render.resolution_y=1600;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.render.image_settings.color_mode='RGBA'
gallery.view_settings.view_transform='AgX';gallery.view_settings.look='AgX - Medium High Contrast';gallery.view_settings.exposure=-.3
portrait=clone_tree(root,gallery);portrait.location.z=.17
for loc,energy,size,color in [((-2,3,3),280,2.5,(1,.85,.66)),((2,2,2),150,2,(.68,.93,1)),((0,3,-2),350,1.7,(.65,1,.84))]:
    bpy.ops.object.light_add(type='AREA',location=xyz(loc));lamp=bpy.context.object;lamp.data.energy=energy;lamp.data.size=size;lamp.data.color=color;aim(lamp,(0,.5,0))
bpy.ops.object.camera_add(location=xyz((.8,1.18,3.7)));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=1.70;aim(camera,(0,.61,0));gallery.camera=camera
stage=[]
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.64,depth=.06,location=xyz((0,.0,0)));plinth=bpy.context.object;plinth.data.materials.append(plain('Wayfinder stone',(.023,.053,.047,1)));stage.append(plinth)
bevel=plinth.modifiers.new('Soft rim','BEVEL');bevel.width=.012;bevel.segments=2
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.641,depth=.010,location=xyz((0,-.025,0)));rim=bpy.context.object;rim.data.materials.append(plain('Wayfinder presentation brass',(.25,.18,.064,1),.65));stage.append(rim)
bpy.ops.mesh.primitive_plane_add(size=200,location=xyz((0,-.04,0)));floor=bpy.context.object;floor.data.materials.append(plain('Wayfinder studio floor',(.012,.025,.023,1)));stage.append(floor)
gallery.render.filepath=str(PREVIEW)
if '--render' in sys.argv:
    bpy.ops.render.render(write_still=True)
    for obj in stage: obj.hide_render=True
    gallery.render.film_transparent=True;gallery.render.resolution_x=512;gallery.render.resolution_y=512
    camera.data.ortho_scale=1.51;camera.location=xyz((.55,1.05,4));aim(camera,(0,.66,0))
    gallery.render.filepath=str(ICON);bpy.ops.render.render(write_still=True)
    for obj in stage: obj.hide_render=False
    gallery.render.film_transparent=False;gallery.render.resolution_x=1600;gallery.render.resolution_y=1600
    camera.location=xyz((.8,1.18,3.7));camera.data.ortho_scale=1.70;aim(camera,(0,.61,0));gallery.render.filepath=str(PREVIEW)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('WAYFINDER_SPRITE '+json.dumps({'triangles':root['triangles'],'height':root['height'],'width':root['width'],'depth':max(v.z for v in all_vertices)-min(v.z for v in all_vertices),'materials':len(document['materials']),'parts':list(parts),'bytes':len(raw)}))
