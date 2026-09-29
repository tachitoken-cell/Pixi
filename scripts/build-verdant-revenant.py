"""Author Verdant Revenant, Mossvale's spectral jade dragon mount.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-verdant-revenant.py -- --render
Original mesh geometry, vertex palettes, rigid animation joints; no external art.
GLB contract: metres, Y up, +Z forward; weighted 14-bone tail, saddle metadata on root.
"""
import bpy
import json
import math
import random
import struct
import subprocess
import tempfile
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / 'public/models/verdant-revenant.glb'
SOURCE = ROOT / 'assets/source/verdant-revenant.blend'
PREVIEW = ROOT / 'assets/source/verdant-revenant-preview.png'
ICON = ROOT / 'public/ui/mount-verdant-revenant.png'
ID = 'verdant-revenant'
random.seed(43)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.name = 'Verdant Revenant - export collection'
scene.unit_settings.system = 'METRIC'

def xyz(*p):
    p = p[0] if len(p) == 1 else p
    return Vector((p[0], -p[2], p[1]))
def linear(v): return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
def rgba(h): return tuple(linear(int(h[i:i+2], 16) / 255) for i in (0, 2, 4)) + (1,)
HEX = {'deep':'143E35','skin':'235F49','jade':'387A56','scale':'458D60','light':'6CA56C','edge':'91BC80',
       'belly':'92A477','bellydark':'637957','brass':'A88949','gold':'D1B16B','patina':'596849','shadow':'273A31',
       'leather':'2C342E','leatherlight':'4A5140','cloth':'25524A','clothlight':'467865','bone':'D9D5A0',
       'flame':'35CB67','flamelight':'96F381','flamedark':'268044','eye':'D8FFC5','ink':'122A24'}
COLORS = {k:rgba(v) for k,v in HEX.items()}
materials = []
for name, metal, rough, emission in [('Forest jade and hide', .10, .71, 0), ('Aged brass and gilding', .62, .44, 0), ('Jade spirit fire', .05, .42, 2.0)]:
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = rough
    tint = mat.node_tree.nodes.new('ShaderNodeVertexColor'); tint.layer_name = 'DragonTint'
    mat.node_tree.links.new(tint.outputs['Color'], shader.inputs['Base Color'])
    if emission:
        # glTF emission has no vertex-color input; explicit green exports faithfully.
        shader.inputs['Emission Color'].default_value = rgba('20DF45')
        shader.inputs['Emission Strength'].default_value = emission
    materials.append(mat)

root = bpy.data.objects.new('mount-'+ID, None); scene.collection.objects.link(root)
root['seatY'] = 1.98; root['seatZ'] = -.10
root['displayName'] = 'Verdant Revenant'; root['authoredWith'] = 'Blender'
root['contract'] = 'Metres, Y up, +Z forward; rigid joints; spectral hover uses existing ground movement.'
parts = {}; current = None

def part(name, pivot, parent=None):
    global current
    node = bpy.data.objects.new(ID+'-'+name, None); scene.collection.objects.link(node)
    parent_node = parts[parent]['node'] if parent else root
    parent_pivot = parts[parent]['pivot'] if parent else Vector((0,0,0))
    node.parent = parent_node; node.location = xyz(Vector(pivot)-parent_pivot)
    parts[name] = {'node':node, 'pivot':Vector(pivot), 'vertices':[], 'faces':[], 'colors':[], 'materials':[],'uvs':[]}
    current = parts[name]
    return node

def mesh(vertices, faces, color='jade', material=0):
    start = len(current['vertices']); pivot = current['pivot']
    current['vertices'].extend(xyz(Vector(v)-pivot) for v in vertices)
    current['uvs'].extend([(0,0)]*len(vertices))
    for face in faces:
        current['faces'].append(tuple(start+i for i in face))
        current['colors'].append(COLORS[color]); current['materials'].append(material)

def tube(points, radii, color='jade', sides=10, material=0, flatten=1):
    """Square carved sections, matching the existing wild-pet limbs and horns."""
    sides=4
    points = [Vector(p) for p in points]; vertices=[]
    for i,p in enumerate(points):
        tangent = (points[min(i+1,len(points)-1)]-points[max(i-1,0)]).normalized()
        side = tangent.cross(Vector((1,0,0)))
        if side.length < .01: side = tangent.cross(Vector((0,0,1)))
        side.normalize(); across = side.cross(tangent).normalized()
        for j in range(sides):
            a = j*math.tau/sides+math.pi/4
            vertices.append(p + (across*math.cos(a)*flatten+side*math.sin(a))*radii[i]*math.sqrt(2))
    faces=[]
    for i in range(len(points)-1):
        for j in range(sides):
            a=i*sides+j; b=i*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))), tuple(range((len(points)-1)*sides,len(points)*sides))])
    mesh(vertices,faces,color,material)

def curve(points, radii, color='jade', sides=10, material=0, steps=4, flatten=1):
    points=[Vector(p) for p in points]; out=[]; sizes=[]
    for i in range(len(points)-1):
        p0,p1,p2,p3=points[max(0,i-1)],points[i],points[i+1],points[min(len(points)-1,i+2)]
        for j in range(steps):
            t=j/steps
            out.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
            sizes.append(radii[i]*(1-t)+radii[i+1]*t)
    out.append(points[-1]); sizes.append(radii[-1]); tube(out,sizes,color,sides,material,flatten)
    return out,sizes

def ellipsoid(center, radius, color='jade', sides=12, rows=7, material=0):
    """The wild-pet builder's stepped solid with greedy exterior faces, at mount scale."""
    detail=max(4,min(7,round(sides/2.5)))
    unit=max(.012,max(radius)*2/detail)
    dims=[max(1,math.ceil(r*2/unit)) for r in radius]
    cells={(x,y,z) for x in range(dims[0]) for y in range(dims[1]) for z in range(dims[2])
           if sum(((value+.5)*2/size-1)**2 for value,size in zip((x,y,z),dims))<=1}
    vertices=[]; faces=[]
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
                    x,y=min(mask,key=lambda p:(p[1],p[0])); width=1; height=1
                    while (x+width,y) in mask: width+=1
                    while all((x+i,y+height) in mask for i in range(width)): height+=1
                    mask.difference_update((x+i,y+j) for i in range(width) for j in range(height))
                    offset=len(vertices)
                    for a,b in ((x,y),(x+width,y),(x+width,y+height),(x,y+height)):
                        vtx=[0,0,0]; vtx[axis]=layer+(direction>0); vtx[u]=a; vtx[v]=b
                        vertices.append(tuple(center[j]+(vtx[j]*2/dims[j]-1)*radius[j] for j in range(3)))
                    faces.append(tuple(offset+i for i in ((0,1,2,3) if direction>0 else (3,2,1,0))))
    mesh(vertices,faces,color,material)

def leaf(center, along, across, length, width, lift, color='scale', material=0):
    # Stepped carved plates use the same block profile as the existing pet feathers.
    c=Vector(center); t=Vector(along).normalized(); u=Vector(across).normalized(); n=t.cross(u).normalized()
    profiles=[.72,1,.40]; vertices=[]; faces=[]
    for i,profile in enumerate(profiles):
        a=-.48+i/3; b=a+1/3; w=profile*width/2; start=len(vertices)
        vertices.extend(c+t*(d*length)+u*x+n*h for h in [0,lift] for d,x in [(a,-w),(b,-w),(b,w),(a,w)])
        faces.extend(tuple(start+j for j in face) for face in [(4,5,6,7),(0,1,5,4),(2,3,7,6)])
        if i==0: faces.append(tuple(start+j for j in (3,0,4,7)))
        if i==2: faces.append(tuple(start+j for j in (1,2,6,5)))
        if i:
            old=profiles[i-1]*width/2
            for sign in [-1,1]:
                offset=len(vertices)
                vertices.extend(c+t*(a*length)+u*x+n*h for x,h in [(sign*old,0),(sign*w,0),(sign*w,lift),(sign*old,lift)])
                faces.append(tuple(offset+j for j in ([3,2,1,0] if sign==1 else [0,1,2,3])))
    mesh(vertices,faces,color,material)

def scaled_spine(points,radii,rows=24,around=9):
    # Scale rows follow the authored spine. The ridge and palette stay legible at game zoom.
    for i in range(1,len(points)-1):
        if i%max(1,len(points)//rows): continue
        p=points[i]; tangent=(points[i+1]-points[i-1]).normalized()
        radial_y=tangent.cross(Vector((1,0,0))).normalized(); radial_x=radial_y.cross(tangent).normalized()
        for j in range(12):
            radial=[radial_x,radial_y,-radial_x,-radial_y][j//3]
            cross=radial.cross(tangent).normalized()
            color=['jade','scale','scale','light'][(i+j//3)%4]
            center=p+radial*(radii[i]+.008)+cross*((j%3-1)*radii[i]*.68)
            length=min(.26,max(.035,radii[i]*.9)); width=max(.015,radii[i]*.66)
            leaf(center,tangent,cross,length,width,min(.036,radii[i]*.12),color)
            # Alternate raised inlays leave clear flat planes between carved scale rows.
            if (i+j)%3==0:
                leaf(center+radial*.019,tangent,cross,length*.56,width*.46,.022,'edge' if (i+j)%6==0 else 'jade')
            if (i+j)%9==0:
                tube([center-tangent*length*.13+radial*.045,center+tangent*length*.21+radial*.042],[.008,.004],'flamedark',5,2)

def blade(a,b,width,color='flame', material=2, bend=.18):
    a,b=Vector(a),Vector(b); delta=b-a
    midpoint=a+delta*.52+Vector((0,bend,-bend*.3))
    curve([a,midpoint,b],[width,width*.54,.003],color,5,material,steps=3,flatten=.45)

def flame_tongue(base,tip,width,seed):
    # Angular fire ribbons, not swept hair: uneven shoulders, curled tips and tapered forks.
    base,tip=Vector(base),Vector(tip); side=1 if base.x>0 else -1
    across=Vector((side*.30,.93,.17)).normalized(); vertices=[]; uvs=[]
    for j,t in enumerate([0,.18,.37,.58,.77,.91,1]):
        center=base.lerp(tip,t)+Vector((side*math.sin(t*5+seed)*.08*t,math.sin(t*4+seed)*.06*t,-math.sin(t*3)*.10))
        breadth=width*(1-t)**.65*(.78+.22*math.sin(t*11+seed))+.002
        for sign in [-1,1]: vertices.append(center+across*breadth*sign); uvs.append(((sign+1)/2,1-t))
    faces=[(j*2,j*2+1,j*2+3,j*2+2) for j in range(6)]
    mesh(vertices,faces,'flame',2); current['uvs'][-len(vertices):]=uvs

def ring(center,radius,normal,color='brass',width=.024,material=1,sides=18):
    center=Vector(center); normal=Vector(normal).normalized(); u=normal.cross(Vector((0,1,0)))
    if u.length<.01: u=normal.cross(Vector((1,0,0)))
    u.normalize(); v=normal.cross(u).normalized()
    ps=[center+radius*(u*math.cos(math.tau*i/sides)+v*math.sin(math.tau*i/sides)) for i in range(sides+1)]
    tube(ps,[width]*len(ps),color,6,material)

def rivet(center,r=.025): ellipsoid(center,(r,r,r),'gold',8,4,1)

def slab(center,size,color='leather',material=0,bevel=.06):
    x,y,z=center; w,h,d=size; b=min(bevel,w/4,d/4)
    outline=[(-w/2+b,-d/2),(w/2-b,-d/2),(w/2,-d/2+b),(w/2,d/2-b),(w/2-b,d/2),(-w/2+b,d/2),(-w/2,d/2-b),(-w/2,-d/2+b)]
    vertices=[(x+a,y+level*h/2,z+c) for level in [-1,1] for a,c in outline]
    faces=[tuple(reversed(range(8))),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
    mesh(vertices,faces,color,material)

part('body',(0,1.43,-.05))
points,radii=curve([(0,1.40,-1.08),(0,1.37,-.67),(0,1.43,0),(0,1.50,.62),(0,1.71,.95)],[.31,.43,.48,.44,.32],'skin',14,steps=5)
scaled_spine(points,radii,24,12)
# Broad pale segmented underside contrasts with black-green scales.
for i in range(12):
    z=-.95+i*.145; y=1.0+max(0,z)*.18
    leaf((0,y,z),(0,0,-1),(1,0,0),.23,.48,.055,'belly' if i%3 else 'bellydark')
# Jade ridge spikes remain below the saddle only at the back and shoulders.
for z,y,height in [(-1.05,1.72,.27),(-.84,1.78,.26),(.61,1.89,.33),(.83,2.0,.31)]:
    blade((0,y,z),(0,y+height,z-.2),.105,'flamedark')
# Recessed riding saddle, brass bound curved cantle, patterned blanket and stirrups.
slab((0,1.83,-.10),(.95,.10,.90),'cloth')
slab((0,1.925,-.10),(.69,.10,.65),'leather')
for z in [-.48,.28]:
    curve([(-.37,1.96,z),(-.22,2.06,z),(0,2.09,z),(.22,2.06,z),(.37,1.96,z)],[.045]*5,'brass',8,1,2)
for side in [-1,1]:
    # Overlapping armor plates have bevels, gold outlines, lacing and chased veins.
    for row in range(3):
        y=1.78-row*.18
        for col in range(5):
            z=-.52+col*.19+(row%2)*.02; x=side*(.48+row*.008)
            leaf((x,y,z),(0,-1,0),(0,0,side),.30,.18,.022,'cloth' if row<2 else 'clothlight')
            curve([(x+side*.027,y+.035,z-.063),(x+side*.031,y-.08,z),(x+side*.027,y+.035,z+.063)],[.008]*3,'gold',5,1,2)
            rivet((x+side*.026,y+.095,z),.015)
            # Jade inlay, tiny binding stitches and a carved double border on every lamella.
            leaf((x+side*.033,y-.01,z),(0,-1,0),(0,0,side),.12,.046,.009,'flamedark',2)
            for dz in [-.061,.061]:
                tube([(x+side*.031,y+.065,z+dz),(x+side*.035,y+.023,z+dz)],[.006,.006],'leatherlight',5)
            curve([(x+side*.031,y-.018,z-.04),(x+side*.034,y-.108,z),(x+side*.031,y-.018,z+.04)],[.004]*3,'patina',5,1,2)
    tube([(side*.43,1.95,.05),(side*.63,1.52,.02),(side*.62,1.06,.02)],[.026,.024,.022],'leatherlight',6)
    ring((side*.62,1.02,.035),.11,(1,0,0),'brass',.018)
    tube([(side*.61,.925,-.045),(side*.61,.925,.115)],[.023,.023],'brass',6,1)
    # A faceted jade seal hangs from the saddle, surrounded by engraved brass petals.
    ring((side*.535,1.51,-.65),.14,(1,0,0),'gold',.017,1,16)
    ellipsoid((side*.546,1.51,-.65),(.032,.093,.093),'flamedark',10,6,2)
    for a in range(8):
        angle=a*math.tau/8
        rivet((side*.55,1.51+math.cos(angle)*.135,-.65+math.sin(angle)*.135),.014)
    # Shoulder lamellar guards, reed-shaped brass tracery, hanging prayer cord.
    for row in range(3):
        for col in range(3):
            c=(side*(.38+row*.055),1.80-row*.14,.61+col*.13)
            leaf(c,(0,-.6,-.8),(0,-.8,.6*side),.32,.19,.026,'deep')
            rivet((c[0]+side*.035,c[1]+.025,c[2]),.018)
    curve([(side*.56,1.77,-.55),(side*.63,1.53,-.65),(side*.60,1.27,-.61)],[.016,.018,.010],'gold',6,1,4)
    for i in range(4): tube([(side*(.58+i*.012),1.30,-.61),(side*(.56+i*.016),1.09,-.63)],[.012,.004],'clothlight',5)

head=part('head',(0,1.70,.76),'body'); head['reinAnchor']=[.43,.54,.94]
part('mane',(0,2.33,1.13),'head'); current=parts['head']
points,radii=curve([(0,1.62,.79),(0,1.97,1.03),(0,2.30,1.13),(0,2.45,1.40)],[.33,.32,.30,.33],'skin',14,steps=5)
scaled_spine(points,radii,18,11)
# Stepped cheekbones and squared muzzle match the block-built horse, wolf and wild pets.
ellipsoid((0,2.47,1.44),(.44,.33,.45),'jade',14,8)
slab((0,2.32,1.88),(.64,.32,.79),'skin',bevel=.025)
slab((0,2.48,1.79),(.51,.09,.60),'jade',bevel=.012)
slab((0,2.16,1.87),(.56,.12,.72),'bellydark',bevel=.015)
slab((0,2.29,2.16),(.57,.25,.30),'deep',bevel=.015)
for side in [-1,1]:
    curve([(side*.16,2.245,2.24),(side*.29,2.22,2.06),(side*.30,2.215,1.73)],[.013]*3,'ink',5,steps=4)
    ellipsoid((side*.19,2.37,2.245),(.053,.032,.025),'ink',8,5)
    # Faceted eye sockets and swept pointed brow rather than spherical cartoon eyes.
    leaf((side*.404,2.54,1.59),(0,.10,.99),(0,-side*.99,.10),.32,.17,.025,'ink')
    leaf((side*.431,2.549,1.615),(0,.08,.996),(0,-side*.996,.08),.21,.090,.021,'eye',2)
    tube([(side*.448,2.52,1.64),(side*.452,2.59,1.642)],[.012,.008],'deep',5)
    curve([(side*.29,2.61,1.78),(side*.44,2.69,1.59),(side*.49,2.65,1.36)],[.055,.082,.015],'deep',6,steps=3)
    curve([(side*.23,2.245,2.00),(side*.245,2.11,2.03),(side*.24,2.045,2.12)],[.05,.035,.001],'bone',8,steps=3)
    curve([(side*.235,2.235,1.79),(side*.27,2.11,1.83)],[.035,.001],'bone',7,steps=4)
    # The two main antlers and branches sweep back from the forehead.
    curve([(side*.27,2.67,1.34),(side*.43,2.96,1.21),(side*.53,3.24,.88),(side*.57,3.49,.85)],[.105,.088,.048,.002],'brass',9,1,4)
    curve([(side*.43,2.96,1.21),(side*.64,3.15,1.17),(side*.72,3.37,1.31)],[.067,.040,.002],'gold',8,1,4)
    curve([(side*.51,3.20,.94),(side*.38,3.33,.71),(side*.35,3.48,.61)],[.042,.025,.002],'brass',8,1,3)
    for i in range(3): ring((side*(.32+i*.035),2.76+i*.065,1.29-i*.033),.095-i*.009,(side*.25,.9,-.36),'patina',.012,1,10)
    # Engraved horn collars and luminous channels make the antlers readable up close.
    curve([(side*.29,2.74,1.36),(side*.45,3.00,1.23),(side*.54,3.25,.91)],[.011,.010,.004],'flamedark',5,2,5)
    for j in range(5):
        leaf((side*.452,2.46-j*.043,1.73-j*.065),(0,-.25,-.97),(0,side*.97,-.25),.16,.14,.018,'edge' if j%2 else 'scale')
    # Leaf-shaped ears and layered fiery whisker mane fan outward and backward.
    leaf((side*.46,2.53,1.22),(side*.54,.42,-.73),(0,.87,.5),.70,.30,.045,'skin')
    current=parts['mane']
    for i in range(7):
        a=Vector((side*(.32+i*.023),2.48-i*.105,1.28-i*.055))
        tip=a+Vector((side*(.40+.12*math.sin(i*2)),.50+.22*math.sin(i*1.7+.4),-.55-.25*math.cos(i*1.3)))
        flame_tongue(a,tip,.16+.035*math.sin(i),i*.81)
        if i%2==0:
            fork=a.lerp(tip,.45)
            flame_tongue(fork,tip+Vector((side*.17,.21,.13)),.07,i*.81+2)
    current=parts['head']
    # Long eastern-dragon whiskers curl back, kept solid and thin for a clean export.
    curve([(side*.26,2.35,2.15),(side*.59,2.34,2.08),(side*.77,2.47,1.82),(side*.82,2.64,1.65)],[.024,.023,.015,.001],'flame',7,2,5)
    tube([(side*.34,2.33,1.89),(side*.425,2.24,1.70)],[.022,.021],'brass',6,1)
    ring((side*.43,2.24,1.70),.078,(1,0,0),'gold',.014,1)
# Cheek and nose plates carry the scales into the muzzle instead of a plain skull.
for side in [-1,1]:
    for i in range(5):
        leaf((side*(.34+i*.012),2.47-i*.055,1.35-i*.07),(0,-.32,-.95),(0,side*.95,-.32),.27,.17,.026,'scale' if i%2 else 'jade')
for i in range(4):
    leaf((0,2.49-i*.028,1.79+i*.085),(0,-.24,1),(1,0,0),.18,.34-i*.02,.025,'jade')
# Dragon forehead crest and forked spectral beard.
leaf((0,2.741,1.47),(0,-.35,1),(1,0,0),.58,.38,.05,'deep')
leaf((0,2.788,1.48),(0,-.35,1),(1,0,0),.39,.19,.035,'gold',1)
ellipsoid((0,2.83,1.46),(.058,.045,.085),'flamelight',8,5,2)
for i in range(5):
    blade(((i-2)*.066,2.12,1.70),((i-2)*.096,1.72+abs(i-2)*.06,1.33),.085,'flame',2,.02)
for i in range(5):
    blade((0,1.95+i*.12,.73+i*.09),(0,2.14+i*.14,.38+i*.105),.13,'flame',2,.12)

# Floating dragon limbs: folded hocks, dangling palms and hooked talons, no planted paws.
for side,label in [(-1,'left'),(1,'right')]:
    for front,z in [(True,.67),(False,-.72)]:
        name=('front-' if front else 'rear-')+label; x=side*.40
        part(name,(x,1.45,z),'body')
        elbow=(side*.68,1.03,z+(.16 if front else -.24))
        curve([(x,1.47,z),(side*.63,1.26,z+(.07 if front else -.12)),elbow],[.205,.18,.105],'skin',10,steps=4)
        ellipsoid((side*.59,1.31,z),(.18,.21,.20),'deep',10,6)
        for j in range(4):
            leaf((side*.755,1.37-j*.06,z),(0,-1,.18),(0,-.18,-side),.17,.17,.020,'scale' if j%2 else 'jade')
        blade((side*.61,1.28,z-.12),(side*.84,1.61,z-.55),.085,'flame',2,.09)
        part(name+'-knee',elbow,name)
        palm_z=z+(.33 if front else -.10)
        curve([elbow,(side*.68,.91,palm_z-.10),(side*.70,.72,palm_z)],[.11,.09,.11],'jade',9,steps=4)
        ring((side*.685,.87,palm_z-.055),.109,(0,1,-.35),'brass',.022,1)
        ellipsoid((side*.70,.68,palm_z),(.15,.16,.15),'skin',10,6)
        for digit in [-1,0,1]:
            dx=digit*.13
            curve([(side*.70+dx*.50,.69,palm_z),(side*.70+dx,.50,palm_z+.045),(side*.70+dx*1.18,.46,palm_z+.14)],[.061,.05,.026],'jade',7,steps=4)
            curve([(side*.70+dx*1.18,.47,palm_z+.12),(side*.70+dx*1.2,.455,palm_z+.22),(side*.70+dx*1.16,.58,palm_z+.27)],[.043,.030,.001],'bone',7,steps=4)
        curve([(side*.80,.74,palm_z-.01),(side*.91,.62,palm_z-.075),(side*.90,.52,palm_z+.01)],[.052,.038,.001],'bone',7,steps=4)
        for j in range(3):
            blade((side*.69,.82+j*.065,palm_z-.10),(side*(.91+j*.018),1.06+j*.06,palm_z-.46),.065,'flame',2,.07)

# A centered downward rest curve lets the animated tip curl equally left and right.
tail_specs=[
    ('tail',(0,1.39,-1.02),'body',[(0,1.39,-1.02),(0,1.24,-1.65),(0,1.02,-2.30)],[.31,.27,.22]),
    ('tail-1',(0,1.02,-2.30),'tail',[(0,1.02,-2.30),(0,.82,-3.00),(0,.69,-3.65)],[.22,.18,.13]),
    ('tail-2',(0,.69,-3.65),'tail-1',[(0,.69,-3.65),(0,.58,-4.10),(0,.43,-4.50),(0,.29,-4.84),(0,.17,-5.10)],[.13,.10,.065,.033,.006]),
]
tail_centerline=[]
for name,pivot,parent,spine,sizes in tail_specs:
    part(name,pivot,parent)
    points,radii=curve(spine,sizes,'skin',12,steps=6)
    tail_centerline.extend(points if not tail_centerline else points[1:])
    scaled_spine(points,radii,30,9)
    for i in range(1,len(points)-1,2):
        p=points[i]; r=radii[i]
        blade(p+Vector((0,r*.82,0)),p+Vector((0,r+.19,-.12)),max(.035,r*.26),'brass',1,.035)
        if i%4==1:
            for side in [-1,1]:
                blade(p+Vector((side*r*.8,r*.25,0)),p+Vector((side*(r+.10),r+.17,-.17)),max(.025,r*.22),'flame',2,.025)
# Long flame pennants flow downward from the tip, never closing into an upright coil.
for side in [-1,0,1]:
    curve([(side*.045,.29,-4.84),(side*.09,.15,-5.15),(side*.14,.06,-5.35)],[.062,.047,.001],'flame',6,2,5,flatten=.5)

# One skinned tail mesh avoids cracks between rigid chunks and keeps just three draw calls.
tail_data=parts['tail']
for name in ['tail-1','tail-2']:
    data=parts[name]; start=len(tail_data['vertices']); offset=xyz(data['pivot']-tail_data['pivot'])
    tail_data['vertices'].extend(v+offset for v in data['vertices'])
    tail_data['faces'].extend(tuple(start+i for i in face) for face in data['faces'])
    tail_data['colors'].extend(data['colors']); tail_data['materials'].extend(data['materials'])
    data['vertices']=[]; data['faces']=[]; data['colors']=[]; data['materials']=[]
lengths=[0.0]
for a,b in zip(tail_centerline,tail_centerline[1:]): lengths.append(lengths[-1]+(b-a).length)
knots=[]
for i in range(15):
    distance=lengths[-1]*i/14
    j=next((j for j in range(len(lengths)-1) if lengths[j+1]>=distance),len(lengths)-2)
    point=tail_centerline[j].lerp(tail_centerline[j+1],(distance-lengths[j])/(lengths[j+1]-lengths[j]))
    knots.append(xyz(point-tail_data['pivot']))
armature=bpy.data.armatures.new('Verdant flowing tail')
tail_rig=bpy.data.objects.new(ID+'-tail-rig',armature); scene.collection.objects.link(tail_rig)
tail_rig.parent=tail_data['node']
bpy.context.view_layer.objects.active=tail_rig; tail_rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for i in range(14):
    bone=armature.edit_bones.new(ID+f'-tail-flow-{i:02}')
    bone.head=knots[i]; bone.tail=knots[i+1]
    if i: bone.parent=armature.edit_bones[ID+f'-tail-flow-{i-1:02}']; bone.use_connect=True
bpy.ops.object.mode_set(mode='OBJECT')
# Remaining rigid joints share three materials and no textures.
triangles=0
for name,data in parts.items():
    if not data['vertices']: continue
    geometry=bpy.data.meshes.new(ID+'-'+name+'-geometry')
    geometry.from_pydata(data['vertices'],[],data['faces']); geometry.update()
    for mat in materials: geometry.materials.append(mat)
    tint=geometry.color_attributes.new(name='DragonTint',type='BYTE_COLOR',domain='CORNER')
    for face,color,mat in zip(geometry.polygons,data['colors'],data['materials']):
        face.material_index=mat
        for index in face.loop_indices: tint.data[index].color=color
    if name=='mane':
        uv=geometry.uv_layers.new(name='FlameFlow')
        for loop in geometry.loops: uv.data[loop.index].uv=data['uvs'][loop.vertex_index]
    geometry.calc_loop_triangles(); triangles+=len(geometry.loop_triangles)
    obj=bpy.data.objects.new(ID+'-'+name+'-mesh',geometry); scene.collection.objects.link(obj); obj.parent=data['node']
    if name=='tail':
        groups=[obj.vertex_groups.new(name=ID+f'-tail-flow-{i:02}') for i in range(14)]
        for vertex in geometry.vertices:
            best_distance=float('inf'); parameter=0
            for i in range(14):
                delta=knots[i+1]-knots[i]
                along=max(0,min(1,(vertex.co-knots[i]).dot(delta)/delta.length_squared))
                distance=(vertex.co-(knots[i]+delta*along)).length_squared
                if distance<best_distance: best_distance=distance; parameter=i+along-.5
            parameter=max(0,min(13,parameter)); low=int(parameter); high=min(13,low+1); mix=parameter-low
            groups[low].add([vertex.index],1-mix,'REPLACE')
            if high!=low and mix>0: groups[high].add([vertex.index],mix,'REPLACE')
        modifier=obj.modifiers.new('Smooth spectral tail','ARMATURE'); modifier.object=tail_rig
for directory in [EXPORT.parent,SOURCE.parent,ICON.parent]: directory.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
# Reuse the mount pipeline's lossless position weld and compact normal/color storage.
with tempfile.TemporaryDirectory(prefix='verdant-revenant-') as temp:
    welded = str(Path(temp) / 'weld.glb'); quantized = str(Path(temp) / 'quantized.glb')
    cli = ['npx', '--yes', '@gltf-transform/cli@4.5.0']
    for command in [['weld', str(EXPORT), welded], ['quantize', welded, quantized, '--pattern', '{NORMAL,COLOR_*}', '--quantize-normal', '8', '--quantize-color', '8'], ['prune', quantized, str(EXPORT), '--keep-leaves', '--keep-attributes', 'true']]:
        subprocess.run(cli + command, check=True)
# Assert the actual exported asset, leaving one runnable budget/rig check in the builder.
raw=EXPORT.read_bytes(); length=struct.unpack_from('<I',raw,12)[0]; document=json.loads(raw[20:20+length])
for field in ['extensionsUsed', 'extensionsRequired']:
    document[field] = sorted(set(document.get(field, []) + ['KHR_mesh_quantization']))
encoded=json.dumps(document,separators=(',',':')).encode(); encoded+=b' '*(-len(encoded)%4)
tail=raw[20+length:]
EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)
names={node.get('name') for node in document['nodes']}
assert 'mount-'+ID in names
assert all(ID+'-'+part in names for part in ['body','head','tail','tail-1','tail-2','front-left','front-right','rear-left','rear-right'])
assert len(document['materials'])==3 and not document.get('images')
assert all('TEXCOORD_0' in primitive['attributes'] for m in document['meshes'] if 'mane' in m.get('name','') for primitive in m['primitives']), 'preserve flame-flow UVs for the runtime shader'
assert document.get('skins') and any(len(skin['joints'])==14 for skin in document['skins']), 'tail must export its weighted 14-bone rig'
assert triangles<80000, triangles
assert EXPORT.stat().st_size<4*1024*1024, EXPORT.stat().st_size

# Linked beauty scene keeps stage lighting and composition separate from exported geometry.
gallery=bpy.data.scenes.new('Verdant Revenant - beauty'); bpy.context.window.scene=gallery
def clone_tree(source):
    clone=source.copy(); gallery.collection.objects.link(clone)
    for child in source.children:
        child_clone=clone_tree(child); child_clone.parent=clone
    return clone
review_root=clone_tree(root); review_root.location=xyz(0,.95,0)
review_rig=next(obj for obj in review_root.children_recursive if obj.type=='ARMATURE')
for obj in review_root.children_recursive:
    for modifier in obj.modifiers:
        if modifier.type=='ARMATURE': modifier.object=review_rig
gallery.world=bpy.data.worlds.new('Mossvale midnight'); gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.07,.12,.10,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
gallery.render.engine='CYCLES'; gallery.cycles.samples=40; gallery.cycles.use_denoising=True
gallery.render.resolution_x=1500; gallery.render.resolution_y=1180; gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG'; gallery.render.image_settings.color_mode='RGBA'
gallery.view_settings.view_transform='AgX'
def aim(obj,at): obj.rotation_euler=(xyz(at)-obj.location).to_track_quat('-Z','Y').to_euler()
for name,at,power,size,color in [('Warm moon',(-3,7,5),1500,5,(1,.87,.68)),('Jade rim',(3,5,-4),2000,4,(.47,1,.72)),('Face fill',(5,3,6),650,4,(.74,.88,1))]:
    bpy.ops.object.light_add(type='AREA',location=xyz(at)); lamp=bpy.context.object; lamp.name=name
    lamp.data.energy=power; lamp.data.shape='DISK'; lamp.data.size=size; lamp.data.color=color; aim(lamp,(0,1.4,0))
bpy.ops.object.camera_add(location=xyz(7.5,4.0,6.3)); camera=bpy.context.object; camera.name='Beauty camera'
camera.data.type='ORTHO'; camera.data.ortho_scale=7.8; aim(camera,(0,2.15,-1.1)); gallery.camera=camera
bpy.ops.mesh.primitive_plane_add(size=200,location=xyz(0,-.017,0)); floor=bpy.context.object; floor.name='Review only - forest floor'
floor_material=bpy.data.materials.new('Midnight forest floor'); floor_material.use_nodes=True
floor_material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.013,.031,.025,1)
floor_material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.82; floor.data.materials.append(floor_material)
# Restrained glow preserves scale carving and the shape of each spectral flame.
gallery.use_nodes=True
node_tree=bpy.data.node_groups.new('Verdant beauty composite','CompositorNodeTree')
gallery.compositing_node_group=node_tree
out_socket=node_tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
render=node_tree.nodes.new('CompositorNodeRLayers'); render.scene=gallery
glow=node_tree.nodes.new('CompositorNodeGlare'); glow.inputs['Type'].default_value='Fog Glow'; glow.inputs['Quality'].default_value='High'
glow.inputs['Threshold'].default_value=.7
glow.inputs['Strength'].default_value=1.2
output=node_tree.nodes.new('NodeGroupOutput'); node_tree.links.new(render.outputs['Image'],glow.inputs['Image']); node_tree.links.new(glow.outputs['Image'],output.inputs['Image'])
gallery.render.filepath=str(PREVIEW)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
if '--render' in sys.argv:
    bpy.ops.render.render(write_still=True)
    floor.hide_render=True; gallery.render.film_transparent=True
    gallery.render.resolution_x=512; gallery.render.resolution_y=512
    camera.data.ortho_scale=7.4; camera.location=xyz(8,4.4,5.8); aim(camera,(0,2.15,-1.1))
    gallery.render.filepath=str(ICON); bpy.ops.render.render(write_still=True)
    floor.hide_render=False; gallery.render.film_transparent=False
    gallery.render.resolution_x=1500; gallery.render.resolution_y=1180
    camera.data.ortho_scale=7.8; camera.location=xyz(7.5,4.0,6.3); aim(camera,(0,2.15,-1.1))
    gallery.render.filepath=str(PREVIEW); bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('VERDANT_REVENANT '+json.dumps({'triangles':triangles,'bytes':EXPORT.stat().st_size,'materials':len(document['materials']),'drawCalls':sum(len(mesh['primitives']) for mesh in document['meshes']),'joints':list(parts),'seatY':1.98,'seatZ':-.10,'source':str(SOURCE),'preview':str(PREVIEW)}))
