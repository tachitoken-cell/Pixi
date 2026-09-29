"""Author Mossvale's two-seat Wayfarer Stag in Blender.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-wayfarer-stag.py -- --render
Original editable rigid-part meshes. Metres, Y up / +Z forward after GLB export.
The gallery is separate from the export scene; no external models or textures.
"""
import bpy
import json
import math
import random
import struct
import subprocess
import sys
import tempfile
from pathlib import Path
from mathutils import Vector, Euler

ROOT=Path(__file__).resolve().parents[1]
ID='wayfarer-stag'
EXPORT=ROOT/'public/models/wayfarer-stag.glb'
SOURCE=ROOT/'assets/source/wayfarer-stag.blend'
PREVIEW=ROOT/'assets/source/wayfarer-stag-preview.png'
ICON=ROOT/'public/ui/mount-wayfarer-stag.png'
random.seed(27)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene; scene.name='Wayfarer Stag - export geometry'; scene.unit_settings.system='METRIC'
def xyz(*p):
    p=p[0] if len(p)==1 else p
    return Vector((p[0],-p[2],p[1]))
def linear(v): return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def rgba(h): return tuple(linear(int(h[i:i+2],16)/255) for i in (0,2,4))+(1,)
HEX={'hide':'9E693F','hideLight':'BB8D57','warm':'C79A64','furDark':'714936','belly':'D8BF8B','cream':'F2DEAC',
     'ivory':'EEE4C1','boneShade':'BEAD80','hornRoot':'8C784F','hoof':'343535','hoofEdge':'666257',
     'leather':'543729','leatherLight':'876141','leatherEdge':'B08B5A','leatherDark':'33281F',
     'cloth':'245A45','clothDark':'163B33','clothLight':'488363','leaf':'71A777','jade':'42A784','jadeDark':'23695A',
     'gold':'D6B15F','goldLight':'F0D897','brass':'8C764B','stitch':'C2AB73','ink':'1C2824','eye':'D5EBA6','glow':'A6F4BE'}
COLORS={k:rgba(v) for k,v in HEX.items()}
materials=[]
for name,metal,rough,emission in [('Stag hide, cloth and ivory',0,.83,0),('Wayfarer aged gold',.58,.42,0),('Lantern jade',.12,.30,.7)]:
    mat=bpy.data.materials.new(name);mat.use_nodes=True; sh=mat.node_tree.nodes.get('Principled BSDF')
    sh.inputs['Metallic'].default_value=metal;sh.inputs['Roughness'].default_value=rough
    tint=mat.node_tree.nodes.new('ShaderNodeVertexColor');tint.layer_name='WayfarerTint'
    mat.node_tree.links.new(tint.outputs['Color'],sh.inputs['Base Color'])
    if emission: sh.inputs['Emission Color'].default_value=rgba('6CEBB2');sh.inputs['Emission Strength'].default_value=emission
    materials.append(mat)
root=bpy.data.objects.new('mount-'+ID,None);scene.collection.objects.link(root)
for k,v in {'seatY':1.97,'seatZ':.50,'passengerSeatY':1.97,'passengerSeatZ':-.82,'displayName':'Wayfarer Stag','authoredWith':'Blender','contract':'Metres, Y up, +Z forward. Two distinct saddles; rigid joints, x-axis leg swing.'}.items():root[k]=v
parts={};current=None

def part(name,pivot,parent=None):
    global current
    node=bpy.data.objects.new(ID+'-'+name,None);scene.collection.objects.link(node)
    node.parent=parts[parent]['node'] if parent else root
    parent_pivot=parts[parent]['pivot'] if parent else Vector((0,0,0));node.location=xyz(Vector(pivot)-parent_pivot)
    current={'node':node,'pivot':Vector(pivot),'vertices':[],'faces':[],'colors':[],'materials':[]};parts[name]=current
    return node

def mesh(vertices,faces,color='hide',material=0):
    base=len(current['vertices']);current['vertices'].extend(xyz(Vector(v)-current['pivot']) for v in vertices)
    for f in faces:current['faces'].append(tuple(base+i for i in f));current['colors'].append(COLORS[color]);current['materials'].append(material)

def box(center,size,color='hide',material=0,rotation=(0,0,0)):
    c=Vector(center); w,h,d=size; matrix=Euler(rotation,'XYZ').to_matrix()
    v=[c+matrix@Vector((x*w/2,y*h/2,z*d/2)) for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    mesh(v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],color,material)

def tube(points,radii,color='hide',material=0,sides=6):
    points=[Vector(p) for p in points];verts=[]
    for i,p in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(i-1,0)]).normalized()
        u=tangent.cross(Vector((0,0,1)))
        if u.length<.01:u=tangent.cross(Vector((1,0,0)))
        u.normalize();v=tangent.cross(u).normalized()
        for j in range(sides):a=j*math.tau/sides+math.pi/4;verts.append(p+radii[i]*(u*math.cos(a)+v*math.sin(a)))
    faces=[(i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j) for i in range(len(points)-1) for j in range(sides)]
    faces.extend([tuple(reversed(range(sides))),tuple(range((len(points)-1)*sides,len(points)*sides))]);mesh(verts,faces,color,material)

def ellipsoid(center,radius,color='hide',detail=12):
    # Greedy exterior faces keep the stepped, carved style of the wild pet library.
    unit=max(radius)*2/detail;dims=[max(2,math.ceil(r*2/unit)) for r in radius]
    cells={(x,y,z) for x in range(dims[0]) for y in range(dims[1]) for z in range(dims[2]) if sum(((q+.5)*2/n-1)**2 for q,n in zip((x,y,z),dims))<=1}
    verts=[];faces=[]
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
                    x,y=min(mask,key=lambda p:(p[1],p[0]));width=1;height=1
                    while (x+width,y) in mask:width+=1
                    while all((x+i,y+height) in mask for i in range(width)):height+=1
                    mask.difference_update((x+i,y+j) for i in range(width) for j in range(height));base=len(verts)
                    for a,b in [(x,y),(x+width,y),(x+width,y+height),(x,y+height)]:
                        pos=[0,0,0];pos[axis]=layer+(direction>0);pos[u]=a;pos[v]=b
                        verts.append(tuple(center[j]+(pos[j]*2/dims[j]-1)*radius[j] for j in range(3)))
                    faces.append(tuple(base+j for j in ([0,1,2,3] if direction>0 else [3,2,1,0])))
    mesh(verts,faces,color)

def leaf(center,along,across,length,width,thickness,color='cream',material=0):
    # Three squared-off stages, with a tapered tip, echo the game's feather/fur carving.
    c=Vector(center);t=Vector(along).normalized();u=Vector(across).normalized();n=t.cross(u).normalized()
    outline=[(-.5,-.20),(-.31,-.50),(.17,-.50),(.17,-.32),(.38,-.32),(.50,0),(.38,.32),(.17,.32),(.17,.50),(-.31,.50),(-.5,.20)]
    vertices=[c+t*(a*length)+u*(b*width)+n*h for h in [0,thickness] for a,b in outline];k=len(outline)
    faces=[tuple(reversed(range(k))),tuple(range(k,2*k))]+[(i,(i+1)%k,(i+1)%k+k,i+k) for i in range(k)]
    mesh(vertices,faces,color,material)

def ring(center,radius,normal,color='gold',width=.014,material=1,sides=12):
    c=Vector(center);n=Vector(normal).normalized();u=n.cross(Vector((0,1,0)))
    if u.length<.01:u=n.cross(Vector((1,0,0)))
    u.normalize();v=n.cross(u).normalized();p=[c+radius*(u*math.cos(math.tau*i/sides)+v*math.sin(math.tau*i/sides)) for i in range(sides+1)]
    tube(p,[width]*len(p),color,material,4)

def buckle(center,w,h,normal=(1,0,0)):
    c=Vector(center);n=Vector(normal);u=Vector((0,0,1)) if abs(n.x)>.5 else Vector((1,0,0));v=n.cross(u).normalized()
    ps=[c+u*x*w/2+v*y*h/2 for x,y in [(-1,-1),(1,-1),(1,1),(-1,1),(-1,-1)]]
    tube(ps,[.013]*5,'gold',1,4);tube([c-v*h*.4,c+v*h*.4],[.009,.009],'goldLight',1,4)

def diamond(center,w,h,color='gold',material=1,depth=.02):
    x,y,z=center;mesh([(x,y+h/2,z),(x,y,z-w/2),(x,y-h/2,z),(x,y,z+w/2),(x+depth,y,z),(x-depth,y,z)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)],color,material)

def strap(points,width=.035,color='leather'):
    tube(points,[width]*len(points),color,0,4)

part('body',(0,1.44,0))
ellipsoid((0,1.43,-.10),(.55,.45,1.49),'hide',18)
ellipsoid((0,1.40,1.03),(.57,.54,.54),'hideLight',14)
ellipsoid((0,1.41,-1.13),(.56,.49,.55),'furDark',14)
ellipsoid((0,1.15,-.05),(.41,.27,1.22),'belly',16)
# Dense but broad layered shoulder and haunch fur; the saddle leaves the anatomy readable.
for side in [-1,1]:
    for zbase in [-1.18,1.03]:
        for row in range(5):
            for j in range(7):
                a=-.97+j*.30;z=zbase+math.sin(a)*.40;x=side*(.43+math.cos(a)*.13-row*.012);y=1.62-row*.11
                leaf((x,y,z),(0,-1,-.16),(0,0,side),.22,.15,.032,['hideLight','warm','hide','furDark'][(row+j)%4])
    # A few pale dapple marks are deliberate, not a noisy all-over texture.
    for z,y in [(-1.26,1.66),(-1.43,1.45),(-1.12,1.34),(1.22,1.48),(1.37,1.63)]:
        box((side*.546,y,z),(.026,.045,.085),'belly')
# Back blanket, long enough for two riders, with stepped lower silhouette.
box((0,1.836,-.15),(1.05,.07,2.45),'clothDark')
box((0,1.882,-.15),(.99,.035,2.39),'cloth')
for side in [-1,1]:
    x=side*.566
    for i in range(13):
        z=-1.34+i*.195;bottom=1.22-(.08 if i%3==0 else 0)
        box((x,(1.85+bottom)/2,z),(.047,1.85-bottom,.196),'cloth' if i%3 else 'clothLight')
        box((x+side*.028,bottom+.038,z),(.013,.041,.196),'gold',1)
        box((x+side*.030,bottom+.085,z),(.013,.013,.196),'stitch')
        if i%2==0:
            # Embroidered crossed fronds, individual stitches at the hem.
            for sign in [-1,1]:
                tube([(x+side*.033,1.34,z),(x+side*.035,1.49,z+sign*.061)],[.008,.006],'gold',1,4)
                for k in [0,1,2]:
                    leaf((x+side*.04,1.385+k*.03,z+sign*(.02+k*.012)),(0,.7,sign), (0,side, -side*.7),.056,.025,.007,'leaf')
        for dz in [-.055,.055]:box((x+side*.04,bottom+.113,z+dz),(.01,.019,.007),'stitch')
    # Central gilded compass motif sits in the gap between saddles.
    ring((side*.615,1.62,-.18),.115,(1,0,0),'gold',.012,1,16)
    diamond((side*.636,1.62,-.18),.16,.20,'goldLight',1)
    diamond((side*.653,1.62,-.18),.065,.085,'jade',2)

for seat,z in [('driver',.50),('passenger',-.82)]:
    # Empty sculpted sitting wells; pommel and cantle remain outside the rider's hips.
    box((0,1.929,z),(.78,.072,.72),'leatherDark')
    ellipsoid((0,1.948,z),(.34,.026,.30),'leather',12)
    for side in [-1,1]:
        box((side*.37,1.935,z),(.12,.12,.74),'leatherLight')
        tube([(side*.39,1.99,z-.36),(side*.40,1.97,z),(side*.37,1.99,z+.34)],[.012]*3,'gold',1,4)
        # Sewn saddle skirts and three rivets each, outside the sitting surface.
        box((side*.432,1.78,z),(.035,.31,.60),'leather')
        for dz in [-.23,0,.23]:diamond((side*.458,1.865,z+dz),.032,.032,'gold',1,.009)
        for j in range(11):box((side*.457,1.68,z-.25+j*.05),(.012,.025,.008),'stitch')
        # Individually shaped stirrup frames have a clear foot opening.
        strap([(side*.435,1.94,z+.16),(side*.62,1.59,z+.15),(side*.67,1.20,z+.16)],.020)
        buckle((side*.656,1.51,z+.15),.09,.09)
        points=[(side*.67,1.24,z+.16),(side*.69,1.12,z+.045),(side*.70,1.045,z+.045),(side*.70,1.045,z+.275),(side*.69,1.12,z+.275),(side*.67,1.24,z+.16)]
        tube(points,[.018]*len(points),'gold',1,4)
        box((side*.70,1.04,z+.16),(.068,.025,.26),'brass',1)
    tube([(-.37,1.96,z-.37),(-.27,2.015,z-.39),(0,2.035,z-.40),(.27,2.015,z-.39),(.37,1.96,z-.37)],[.05]*5,'leatherLight',0,6)
    tube([(-.31,1.975,z+.35),(0,2.025,z+.38),(.31,1.975,z+.35)],[.047]*3,'leatherLight',0,6)
    tube([(-.28,2.019,z-.402),(0,2.059,z-.411),(.28,2.019,z-.402)],[.010]*3,'gold',1,4)
# Belts below the girth and breast; no floating saddle panels.
for z in [.49,-.83]:
    strap([(-.49,1.78,z),(-.56,1.37,z),(-.38,1.03,z),(0,1.00,z),(.38,1.03,z),(.56,1.37,z),(.49,1.78,z)],.029,'leatherDark')
    for side in [-1,1]:buckle((side*.584,1.33,z),.10,.13)
# Compact rear panniers and rolled forest-green bedroll.
for side in [-1,1]:
    ellipsoid((side*.69,1.34,-1.33),(.16,.24,.26),'leather',10)
    box((side*.70,1.55,-1.33),(.33,.072,.48),'leatherLight')
    for dz in [-.14,.14]:
        box((side*.862,1.34,-1.33+dz),(.023,.39,.043),'leatherDark');buckle((side*.88,1.43,-1.33+dz),.08,.095)
    for j in range(8):box((side*.874,1.22,-1.53+j*.054),(.014,.027,.009),'stitch')
tube([(-.40,1.71,-1.53),(.40,1.71,-1.53)],[.145,.145],'clothLight',0,10)
for side in [-1,1]:
    ring((side*.29,1.71,-1.53),.15,(1,0,0),'leather',.022,0,12)
    ring((side*.413,1.71,-1.53),.098,(1,0,0),'clothDark',.011,0,12)
    ring((side*.415,1.71,-1.53),.061,(1,0,0),'cloth',.009,0,12)

head=part('head',(0,2.23,1.37),'body');head['reinAnchor']=[.29,.36,.75]
# An angled long neck and sculpted chest have a true cervid silhouette.
tube([(0,1.59,1.15),(0,1.92,1.40),(0,2.27,1.54),(0,2.63,1.60)],[.38,.34,.28,.23],'hideLight',0,8)
ellipsoid((0,2.06,1.53),(.28,.54,.28),'hideLight',14)
ellipsoid((0,2.71,1.66),(.285,.31,.37),'hide',14)
ellipsoid((0,2.56,1.98),(.205,.18,.43),'hideLight',14)
ellipsoid((0,2.52,2.29),(.20,.125,.14),'hoof',10)
ellipsoid((0,2.465,2.055),(.18,.075,.29),'cream',12)
# Chest mane: layered ivory fur follows the front throat, each lower row shorter.
for row in range(10):
    y=2.53-row*.105;z=1.87-row*.042
    width=.25+row*.014
    for j in range(7):
        x=(j-3)*width/3.6;front=z+math.sqrt(max(0,1-(x/(width+.03))**2))*.045
        leaf((x,y,front),(0,-1,-.12),(1,0,0),.23,.085,.035,['cream','belly','ivory'][(row+j)%3])
# Short swept mane at the rear of neck, clear of the first saddle.
for row in range(9):
    for side in [-1,1]:
        leaf((side*.12,1.84+row*.092,1.16+row*.022),(0,-.8,-.6),(side,0,0),.19,.14,.042,'furDark' if row%2 else 'hide')
for side in [-1,1]:
    # Wide alert ears are stepped leaf forms; inset pale inner ear, dark tips.
    leaf((side*.41,2.88,1.55),(side,.32,-.18),(0,0,side),.60,.25,.072,'hide')
    leaf((side*.43,2.915,1.565),(side,.32,-.18),(0,0,side),.43,.15,.078,'belly')
    box((side*.271,2.765,1.85),(.035,.137,.177),'furDark')
    box((side*.294,2.776,1.87),(.023,.092,.112),'ink')
    box((side*.311,2.782,1.891),(.013,.060,.070),'eye')
    box((side*.321,2.788,1.908),(.010,.048,.023),'ink')
    box((side*.328,2.806,1.926),(.008,.018,.019),'ivory')
    leaf((side*.290,2.859,1.857),(0,.18,1),(0,side,0),.24,.09,.028,'belly')
    box((side*.16,2.57,2.365),(.049,.024,.018),'ink')
    # Bridle cheek straps, throat strap and metal rings with crisp noseband.
    strap([(side*.24,2.86,1.53),(side*.30,2.69,1.84),(side*.22,2.61,2.21)],.025,'leatherDark')
    ring((side*.29,2.59,2.12),.061,(1,0,0),'gold',.011,1,12)
    buckle((side*.31,2.716,1.81),.10,.11)
    strap([(side*.29,2.60,1.84),(side*.29,2.27,1.66),(side*.20,2.11,1.59)],.021)
strap([(-.21,2.61,2.24),(-.13,2.67,2.245),(.13,2.67,2.245),(.21,2.61,2.24)],.019)
# Forehead plated crest and a single jade compass stone.
leaf((0,2.926,1.818),(0,.2,1),(1,0,0),.32,.33,.032,'cloth')
leaf((0,2.948,1.822),(0,.2,1),(1,0,0),.25,.24,.026,'gold',1)
leaf((0,2.974,1.83),(0,.2,1),(1,0,0),.16,.13,.025,'jade',2)
# Long angular antler beams, varied tines and carved growth ridges.
for side in [-1,1]:
    def p(x,y,z):return (side*x,y,z)
    beam=[p(.19,2.94,1.52),p(.28,3.17,1.47),p(.51,3.47,1.37),p(.82,3.71,1.15),p(1.08,4.02,.96),p(1.21,4.24,.91)]
    tube(beam,[.105,.102,.085,.066,.041,.006],'ivory',0,6)
    tube([beam[0],beam[1]],[.114,.10],'hornRoot',0,6)
    branches=[([p(.30,3.18,1.46),p(.49,3.35,1.79),p(.55,3.60,1.94)],[.067,.044,.005]),
              ([p(.47,3.42,1.39),p(.91,3.52,1.49),p(1.16,3.68,1.66)],[.067,.047,.005]),
              ([p(.64,3.57,1.28),p(.56,3.92,1.37),p(.61,4.17,1.52)],[.06,.040,.004]),
              ([p(.87,3.77,1.11),p(1.20,3.87,1.28),p(1.42,4.03,1.45)],[.050,.03,.004]),
              ([p(1.04,3.96,.99),p(.94,4.22,1.05),p(.96,4.42,1.16)],[.037,.025,.003])]
    for ps,rs in branches:tube(ps,rs,'ivory',0,5)
    for a,b,r in zip(beam[:-1],beam[1:],[.105,.093,.079,.058,.032]):
        av,bv=Vector(a),Vector(b)
        for t in [.24,.52,.80]:ring(av.lerp(bv,t),r*(1-t*.22),(bv-av),'boneShade',.006,0,6)
    ring(p(.26,3.13,1.477),.114,(side*.3,.9,-.2),'gold',.017,1,8)
    ellipsoid(p(.315,3.16,1.575),(.075,.093,.055),'jadeDark',8)
    # Hanging six-sided lanterns sit outside neck/rider space.
    for j in range(6):ring(p(.95,3.52-j*.055,1.53),.032,(1,0,0) if j%2 else (0,0,1),'gold',.006,1,8)
    c=p(.95,3.10,1.53);x,y,z=c
    tube([(x,y-.11,z),(x,y+.11,z)],[.09,.09],'glow',2,6)
    tube([(x,y-.14,z),(x,y-.11,z)],[.055,.12],'gold',1,6)
    tube([(x,y+.11,z),(x,y+.17,z)],[.12,.05],'gold',1,6)
    for j in range(6):
        a=math.tau*j/6;dx=math.cos(a)*.093;dz=math.sin(a)*.093
        tube([(x+dx,y-.115,z+dz),(x+dx,y+.11,z+dz)],[.010,.01],'gold',1,4)
    tube([(x,y-.145,z),(x,y-.215,z)],[.035,.002],'jade',2,4)

for name,x,z,fore in [('front-left',.42,1.08,True),('front-right',-.42,1.08,True),('rear-left',.42,-1.14,False),('rear-right',-.42,-1.14,False)]:
    part(name,(x,1.38,z),'body')
    knee_z=z if fore else z-.065
    ellipsoid((x,1.105,z),(.205,.38,.22) if fore else (.23,.38,.30),'hideLight' if fore else 'hide',12)
    tube([(x,1.22,z),(x,.90,z+(.04 if fore else -.09)),(x,.73,knee_z)],[.17,.112,.107],'hide',0,8)
    for side in [-1,1]:
        for j in range(4):leaf((x+side*.16,1.14-j*.09,z),(0,-1,-.15),(0,0,side),.20,.13,.025,'warm' if fore else 'hideLight')
    part(name+'-knee',(x,.73,knee_z),name)
    ellipsoid((x,.70,knee_z),(.115,.125,.13),'furDark',8)
    tube([(x,.71,knee_z),(x,.42,knee_z+.015),(x,.20,knee_z+.045)],[.091,.074,.09],'belly',0,8)
    # Fur socks above split cloven hooves.
    for j in range(5):leaf((x+(j-2)*.036,.24,knee_z+.116),(0,-1,.20),(1,0,0),.18,.054,.016,'cream')
    for split in [-1,1]:
        box((x+split*.067,.08,knee_z+.084),(.113,.16,.28),'hoof')
        box((x+split*.067,.162,knee_z+.077),(.113,.026,.245),'hoofEdge')
        box((x+split*.067,.057,knee_z+.226),(.111,.049,.010),'leatherDark')
    for side in [-1,1]:box((x+side*.079,.19,knee_z-.060),(.049,.055,.06),'hoof')
part('tail',(0,1.66,-1.47),'body')
ellipsoid((0,1.58,-1.66),(.19,.20,.25),'hideLight',10)
for row in range(4):
    for j in range(5):leaf(((j-2)*.049,1.65-row*.065,-1.78-row*.018),(0,-.55,-1),(1,0,0),.18,.073,.025,'cream' if row>0 else 'belly')

triangles=0
for name,data in parts.items():
    geometry=bpy.data.meshes.new(ID+'-'+name+'-geometry');geometry.from_pydata(data['vertices'],[],data['faces']);geometry.update()
    for mat in materials:geometry.materials.append(mat)
    colors=geometry.color_attributes.new(name='WayfarerTint',type='BYTE_COLOR',domain='CORNER')
    for face,col,mat in zip(geometry.polygons,data['colors'],data['materials']):
        face.material_index=mat
        for idx in face.loop_indices:colors.data[idx].color=col
    geometry.calc_loop_triangles();triangles+=len(geometry.loop_triangles)
    obj=bpy.data.objects.new(ID+'-'+name+'-mesh',geometry);scene.collection.objects.link(obj);obj.parent=data['node']
for path in [EXPORT,SOURCE,PREVIEW,ICON]:path.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
# Use the same small, lossless-position packing as existing game mounts.
with tempfile.TemporaryDirectory(prefix='wayfarer-stag-') as temp:
    welded=str(Path(temp)/'weld.glb');packed=str(Path(temp)/'packed.glb');cli=['npx','--yes','@gltf-transform/cli@4.5.0']
    for command in [['weld',str(EXPORT),welded],['quantize',welded,packed,'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],['prune',packed,str(EXPORT),'--keep-leaves']]:subprocess.run(cli+command,check=True)
raw=EXPORT.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length])
for field in ['extensionsUsed','extensionsRequired']:doc[field]=sorted(set(doc.get(field,[])+['KHR_mesh_quantization']))
encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);tail=raw[20+length:]
EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)
names={n.get('name') for n in doc['nodes']}
assert 'mount-'+ID in names and all(ID+'-'+name in names for name in parts)
assert len(doc['materials'])==3 and not doc.get('images')
assert 18000<triangles<45000,triangles
assert EXPORT.stat().st_size<2200000,EXPORT.stat().st_size
bpy.context.view_layer.update()
coordinates=[obj.matrix_world@v.co for obj in root.children_recursive if obj.type=='MESH' for v in obj.data.vertices]
lo=[min(p[i] for p in coordinates) for i in range(3)];hi=[max(p[i] for p in coordinates) for i in range(3)]
assert abs(lo[2])<.001,(lo,hi)

# Beauty scene stays editable, isolated from the export collection.
gallery=bpy.data.scenes.new('Wayfarer Stag - beauty');bpy.context.window.scene=gallery
def clone_tree(source):
    clone=source.copy();gallery.collection.objects.link(clone)
    for child in source.children:duplicate=clone_tree(child);duplicate.parent=clone
    return clone
clone_tree(root)
gallery.world=bpy.data.worlds.new('Forest studio');gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.11,.18,.16,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
gallery.render.engine='CYCLES';gallery.cycles.samples=40;gallery.cycles.use_denoising=True
gallery.render.resolution_x=1600;gallery.render.resolution_y=1400;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.render.image_settings.color_mode='RGBA';gallery.view_settings.view_transform='AgX'
def aim(obj,at):obj.rotation_euler=(xyz(at)-obj.location).to_track_quat('-Z','Y').to_euler()
for name,at,power,size,col in [('Sun through leaves',(-4,7,5),1700,5,(1,.87,.65)),('Cool rim',(3,6,-4),2300,4,(.64,1,.90)),('Face fill',(5,4,6),850,5,(.81,.92,1))]:
    bpy.ops.object.light_add(type='AREA',location=xyz(at));lamp=bpy.context.object;lamp.name=name;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size;lamp.data.color=col;aim(lamp,(0,2,0))
bpy.ops.object.camera_add(location=xyz(7.4,4.7,7.7));camera=bpy.context.object;camera.name='Wayfarer portrait';camera.data.type='ORTHO';camera.data.ortho_scale=5.8;aim(camera,(0,2.20,.35));gallery.camera=camera
bpy.ops.mesh.primitive_plane_add(size=200,location=xyz(0,-.025,0));floor=bpy.context.object;floor.name='Gallery floor - never exported'
floor_mat=bpy.data.materials.new('Forest studio floor');floor_mat.use_nodes=True;floor_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.027,.059,.045,1);floor_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;floor.data.materials.append(floor_mat)
gallery.render.filepath=str(PREVIEW);bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
if '--render' in sys.argv:
    bpy.ops.render.render(write_still=True)
    floor.hide_render=True;gallery.render.film_transparent=True;gallery.render.resolution_x=512;gallery.render.resolution_y=512
    camera.data.ortho_scale=5.25;camera.location=xyz(7,4.6,7.8);aim(camera,(0,2.21,.45));gallery.render.filepath=str(ICON);bpy.ops.render.render(write_still=True)
    floor.hide_render=False;gallery.render.film_transparent=False;gallery.render.resolution_x=1600;gallery.render.resolution_y=1400
    camera.data.ortho_scale=5.8;camera.location=xyz(7.4,4.7,7.7);aim(camera,(0,2.20,.35));gallery.render.filepath=str(PREVIEW)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('WAYFARER_STAG '+json.dumps({'triangles':triangles,'bytes':EXPORT.stat().st_size,'materials':len(doc['materials']),'drawCalls':sum(len(m['primitives']) for m in doc['meshes']),'boundsYUp':[[lo[0],lo[2],-hi[1]],[hi[0],hi[2],-lo[1]]],'seatY':1.97,'seatZ':.50,'passengerSeatY':1.97,'passengerSeatZ':-.82,'source':str(SOURCE),'preview':str(PREVIEW)}))
