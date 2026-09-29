"""Blender-authored Lanternreach capital kit. Metres, Y up, +Z front, floor Y=0.

Blender --background --python scripts/build-city-assets.py -- --render --optimize
Vertex palette, open interiors, named cutaway faces and authoritative solid footprints.
"""
import bpy
import json
import math
import struct
import subprocess
import sys
import tempfile
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from blender_mesh_utils import remove_hidden_box_faces
EXPORT = ROOT / 'public/models/city-kit.glb'
SOURCE = ROOT / 'assets/source/city-kit.blend'
PREVIEW = ROOT / 'assets/source/city-kit-preview.png'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
library = bpy.context.scene
library.name = 'Lanternreach capital library'
library.unit_settings.system = 'METRIC'

def xyz(x,y,z): return x,-z,y
def linear(v): return v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4
PALETTE = {name: tuple(linear(int(value[i:i+2],16)/255) for i in (0,2,4))+(1,)
           for name,value in {
    'oak':'795338','oaklight':'B08252','oakdark':'493729','plank':'9C7249','planklight':'AE8355',
    'cream':'E1CCA0','plaster':'C8B289','linen':'E4DBC0','stone':'8B8D7C','stonebright':'B0AA92',
    'stoneshade':'5C6962','iron':'354746','teal':'36746A','rooflight':'568F77','roofdark':'28534E',
    'gold':'DFB35F','amber':'F4D38B','wine':'9C4F54','red':'C56B57','leaf':'648647','leaflight':'93B562',
    'water':'4B97A7','waterlight':'8ED2CE','watershade':'2C6378','blue':'6DA9AD','crystal':'AD9AD9',
    'violet':'665D9B','shadow':'302F2B','skin':'D29B73','skinlight':'E8B890','hair':'583C31',
    'limestone':'A8ABA0','warmstone':'969A88','coolstone':'818F8B','mortar':'4B5D58',
    'stoneedge':'C1BBA2','moss':'556B39','mosslight':'81954C','copper':'AB7950','verdigris':'548E7C',
}.items()}
material = bpy.data.materials.new('Lanternreach vertex palette')
material.use_nodes = True
shader = material.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .84
color = material.node_tree.nodes.new('ShaderNodeVertexColor')
color.layer_name = 'CityTint'
material.node_tree.links.new(color.outputs['Color'],shader.inputs['Base Color'])
glass=material.copy();glass.name='Civic clear window glass'
glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.20
glass.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.18
glass.surface_render_method='DITHERED'
roots, stats = [], {}

class Model:
    def __init__(self,name,width,depth):
        self.name,self.width,self.depth = name,width,depth
        self.parts,self.solids,self.current,self.cubes = {},[],None,0
        self.part('interior-furniture')

    def part(self,name,pivot=(0,0,0)):
        self.current_name=name
        self.current = self.parts.setdefault(name,{'vertices':[],'faces':[],'colors':[],'pivot':pivot,'boxes':[]})

    def solid(self,x,z,w,d): self.solids.append([x,z,w,d])

    def box(self,tint,x,y,z,w,h,d,turn=0):
        if tint=='glass':
            name=self.current_name;self.part(name+'-glass')
            self.box('blue',x,y,z,w,h,d,turn);self.part(name);return
        part = self.current
        start = len(part['vertices'])
        c,s = math.cos(turn),math.sin(turn)
        px,py,pz = part['pivot']
        for a,b,f in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
            xx,yy,zz = a*w/2,b*h/2,f*d/2
            part['vertices'].append(xyz(x+xx*c+zz*s-px,y+yy-py,z-xx*s+zz*c-pz))
        for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]:
            part['faces'].append(tuple(start+n for n in face))
            part['colors'].append(PALETTE[tint])
        vertices=part['vertices'][start:]
        # Only axis-aligned boxes participate in exact hidden-face removal.
        if abs(math.sin(turn*2))<1e-8:
            part['boxes'].append((tuple(min(v[a] for v in vertices) for a in range(3)),tuple(max(v[a] for v in vertices) for a in range(3)),len(part['faces'])-6))
        self.cubes += 1

    def wall(self,length,x,z,turn,height,openings=(),stone=False):
        """Apertures run through the structural wall and its raised stone courses."""
        c,s=math.cos(turn),math.sin(turn)
        edges=sorted(set([-length/2,length/2]+[v for a,w,_,_ in openings for v in [a-w/2,a+w/2]]))
        for left,right in zip(edges,edges[1:]):
            middle=(left+right)/2
            opening=next((p for p in openings if abs(middle-p[0])<p[1]/2),None)
            spans=[(0,height)] if not opening else [(0,opening[2]),(opening[3],height)]
            for low,high in spans:
                if high<=low:continue
                self.box('mortar' if stone else 'plaster',x+middle*c,(low+high)/2,z-middle*s,right-left,high-low,.60,turn)
                if stone:
                    stone_face(self,x+middle*c+.298*s,z-middle*s+.298*c,right-left-.012,high-low,low,turn,seed=3,depth=.055)
                else:
                    rows=math.ceil((high-low)/1.5);columns=math.ceil((right-left)/2.3)
                    for row in range(rows):
                        for col in range(columns):
                            u=left+(col+.5)*(right-left)/columns;out=.31+(row%2)*.015
                            self.box('cream',x+u*c+out*s,low+(row+.5)*(high-low)/rows,z-u*s+out*c,(right-left)/columns-.025,(high-low)/rows-.025,.075,turn)

    def floor(self):
        self.part('interior-floor')
        b = self.box
        b('stoneshade',0,-.28,0,self.width,.42,self.depth)
        for ix in range(math.ceil(self.width)):
            for iz in range(math.ceil(self.depth)):
                b('stonebright' if (ix+iz*3)%7==0 else 'stone',
                  -.5*self.width+ix+.5,-.045,-.5*self.depth+iz+.5,.984,.09,.984)

    def disc(self,tint,x,y,z,r,depth,turn=0,sides=32):
        """A restrained faceted clock dial: less geometry than a filled voxel grid."""
        part=self.current;start=len(part['vertices']);c,s=math.cos(turn),math.sin(turn)
        px,py,pz=part['pivot']
        for zz in [-depth/2,depth/2]:
            for i in range(sides):
                xx,yy=math.cos(i*math.tau/sides)*r,math.sin(i*math.tau/sides)*r
                part['vertices'].append(xyz(x+xx*c+zz*s-px,y+yy-py,z-xx*s+zz*c-pz))
        for face in [tuple(start+i for i in reversed(range(sides))),tuple(start+sides+i for i in range(sides))]:
            part['faces'].append(face);part['colors'].append(PALETTE[tint])
        for i in range(sides):
            part['faces'].append((start+i,start+(i+1)%sides,start+sides+(i+1)%sides,start+sides+i))
            part['colors'].append(PALETTE[tint])

    def post(self,x,z,height=4.2,width=.5,stone=False):
        b=self.box
        b('stone' if stone else 'oakdark',x,height/2,z,width,height,width)
        b('stonebright' if stone else 'oaklight',x,.22,z,width+.04,.44,width+.04)
        b('gold',x,height-.40,z,width+.025,.10,width+.025)
        b('stonebright' if stone else 'oaklight',x,height-.08,z,width+.10,.22,width+.10)

    def lantern(self,x,y,z,scale=1):
        b=self.box;s=scale
        b('amber',x,y,z,.30*s,.51*s,.30*s)
        for dy in [-.31,.31]: b('iron',x,y+dy*s,z,.49*s,.12*s,.49*s)
        for dx in [-.18,.18]:
            for dz in [-.18,.18]: b('gold',x+dx*s,y,z+dz*s,.055*s,.62*s,.055*s)
        b('oakdark',x,y+.65*s,z-.23*s,.10*s,.80*s,.10*s)
        b('oaklight',x,y+.95*s,z,.14*s,.14*s,.65*s)

    def roof(self,width,depth,base,top,roof='teal',light='rooflight',x=0,z=0):
        self.part('roof-shingles')
        b=self.box
        tiers=math.ceil((top-base)/.28)
        columns=math.ceil(depth/.88)
        step=width/(tiers*2)
        for i in range(tiers):
            centre=width/2-(i+.5)*step
            yy=base+(top-base)*i/tiers
            for side in [-1,1]:
                for n in range(columns):
                    zz=z-depth/2+(n+.5)*depth/columns
                    b(light if (i*3+n)%7==0 else roof,
                      x+side*centre,yy,zz,step+.14,(top-base)/tiers+.04,depth/columns)
            # Front and rear trim follow the stepped gable silhouette.
            for zz in [z-depth/2-.025,z+depth/2+.025]:
                b('oaklight',x-centre,yy-.10,zz,step+.15,.16,.12)
                b('oaklight',x+centre,yy-.10,zz,step+.15,.16,.12)
        b(light,x,top,z,.52,.25,depth+.12)
        for side in [-1,1]: b('oakdark',x+side*(width/2-.12),base-.18,z,.28,.26,depth)

    def finish(self):
        parent=bpy.data.objects.new('city-'+self.name,None)
        library.collection.objects.link(parent)
        parent['contract']='Metres; Y up; +Z front; walkable floor Y=0; solid boxes in local X/Z.'
        parent['width'],parent['depth']=self.width,self.depth
        parent['solidFootprints']=json.dumps(self.solids,separators=(',',':'))
        for name,data in self.parts.items():
            if not data['faces']: continue
            remove_hidden_box_faces(data)
            mesh=bpy.data.meshes.new(self.name+'-'+name)
            mesh.from_pydata(data['vertices'],[],data['faces'])
            mesh.materials.append(glass if name.endswith('-glass') else material)
            tint=mesh.color_attributes.new(name='CityTint',type='BYTE_COLOR',domain='CORNER')
            for face,colour in zip(mesh.polygons,data['colors']):
                for index in face.loop_indices:tint.data[index].color=colour
            mesh.update()
            obj=bpy.data.objects.new('city-'+self.name+'-'+name,mesh)
            if name=='interior-pendulum':obj['animationPivot']=list(data['pivot'])
            library.collection.objects.link(obj)
            obj.parent=parent
            obj.location=xyz(*data['pivot'])
            obj['part']=name
        roots.append(parent)
        stats[self.name]={'cubes':self.cubes,'triangles':sum(len(face)-2 for data in self.parts.values() for face in data['faces']),'drawCalls':len(parent.children),
                         'footprint':[self.width,self.depth],'solids':self.solids}

def stone_face(m,x,z,width,height,bottom=0,turn=0,seed=0,depth=.10):
    """Staggered ashlar with inset mortar, chipped edges and quiet weathering."""
    b=m.box;c,s=math.cos(turn),math.sin(turn);rows=math.ceil(height/.57);rise=height/rows
    for row in range(rows):
        left=-width/2;column=0
        while left<width/2-.001:
            length=min([.82,1.18,.94,1.38][(column+row+seed)%4],width/2-left)
            middle=left+length/2;y=bottom+(row+.5)*rise
            tint=['limestone','warmstone','coolstone','stone','limestone'][(row*3+column+seed)%5]
            b(tint,x+middle*c,y,z-middle*s,max(.015,length-.038),rise-.035,depth,turn)
            if length>.6 and (row+column+seed)%3==0:
                u=middle-length*.17
                b('stoneedge',x+u*c+(depth/2+.008)*s,y+rise*.33,z-u*s+(depth/2+.008)*c,length*.41,.024,.017,turn)
            if row<2 and (column+seed)%4==0:
                for i in range(3):
                    u=middle-.15+i*.12
                    b('mosslight' if i==1 else 'moss',x+u*c+(depth/2+.014)*s,bottom+.10+row*.16+i*.035,z-u*s+(depth/2+.014)*c,.17,.14-i*.025,.025,turn)
            left+=length;column+=1

def crest_bracket(m,x,y,z,turn=0):
    c,s=math.cos(turn),math.sin(turn)
    for i in range(4):m.box('stoneedge',x,y+i*.14,z,.50+i*.15,.17,.40+i*.10,turn)

def heraldry(m,role,x,y,z,scale=1):
    b=m.box;s=scale
    # Bold original class emblems, built in the same voxel vocabulary as the city.
    if role=='ranger':
        for side in [-1,1]:
            for i in range(5):
                b('gold',x+(.19+i*.105)*s,y+side*(.80-i*.13)*s,z,.18*s,.23*s,.16*s)
        b('linen',x+.12*s,y,z+.015*s,.045*s,1.62*s,.045*s)
        b('oaklight',x-.12*s,y,z+.09*s,1.85*s,.07*s,.08*s)
        for i in range(3):b('linen',x+(.64-i*.13)*s,y+(i-1)*.11*s,z+.08*s,.15*s,.12*s,.12*s)
    elif role=='knight':
        for i,w in enumerate([.80,1.10,1.34,1.50,1.50]):
            b('gold',x,y+(-.81+i*.29)*s,z,w*s,.31*s,.15*s)
            b('wine',x,y+(-.81+i*.29)*s,z+.095*s,(w-.17)*s,.25*s,.10*s)
        b('linen',x,y+.09*s,z+.22*s,.17*s,1.45*s,.09*s)
        b('stonebright',x,y+.84*s,z+.22*s,.26*s,.22*s,.09*s)
        b('gold',x,y-.39*s,z+.24*s,.72*s,.11*s,.12*s)
        b('oakdark',x,y-.65*s,z+.24*s,.13*s,.43*s,.11*s)
    elif role=='mage':
        for i,w in enumerate([.18,.44,.72,.91,.72,.44,.18]):
            b('crystal',x,y+(-.79+i*.26)*s,z,w*s,.28*s,.18*s)
            b('linen',x-w*.21*s,y+(-.79+i*.26)*s,z+.115*s,w*.22*s,.22*s,.07*s)
        for side in [-1,1]:
            b('gold',x+side*.69*s,y,z,.14*s,.14*s,.10*s)
            b('gold',x+side*.84*s,y+.45*s,z,.09*s,.09*s,.10*s)
    else:
        b('gold',x,y,z,.13*s,1.55*s,.12*s)
        b('gold',x,y+.53*s,z,1.70*s,.12*s,.12*s)
        b('gold',x,y-.83*s,z,1.08*s,.14*s,.30*s)
        for side in [-1,1]:
            b('linen',x+side*.67*s,y+.15*s,z,.045*s,.69*s,.045*s)
            b('gold',x+side*.67*s,y-.28*s,z,.62*s,.12*s,.39*s)

# Seventeen-metre watchtowers frame a genuine six-metre passage.
m=Model('gate',12,5);b=m.box
for side in [-1,1]:
    m.part('shell-left' if side<0 else 'shell-right')
    x=side*4.5;m.solid(x,0,3,5)
    b('mortar',x,5.85,0,2.86,11.7,4.84)
    for turn,z in [(0,2.45),(math.pi,-2.45)]:stone_face(m,x,z,2.96,11.5,turn=turn,seed=2 if side<0 else 3)
    for other in [-1,1]:stone_face(m,x+other*1.45,0,4.9,11.5,turn=other*math.pi/2,seed=4)
    b('stoneedge',x,.25,0,3,.5,5)
    for y in [3.65,7.55,10.9]:b('stoneedge',x,y,0,3,.22,5)
    for xx in [-1.24,1.24]:
        for z in [-2.26,2.26]:
            for row in range(15):b('stoneedge' if row%3==0 else 'limestone',x+xx,.55+row*.69,z,.46,.64,.46)
    # Arrow slits and bronze eyebrows face both city and wilderness.
    for front in [-1,1]:
        for y in [4.8,8.8]:
            b('mortar',x,y,front*2.505,.40,1.26,.035)
            b('shadow',x,y,front*2.527,.13,1.05,.026)
            for xx in [-.26,.26]:b('stoneedge',x+xx,y,front*2.505,.10,1.42,.075)
            for yy in [y-.73,y+.73]:b('stoneedge',x,yy,front*2.52,.70,.15,.10)
        b('teal',x,6.8,front*2.56,1.17,1.43,.055)
        for xx in [-.51,.51]:b('gold',x+xx,6.8,front*2.60,.047,1.43,.025)
        b('gold',x,6.8,front*2.61,.19,.50,.035)
    b('stoneedge',x,11.57,0,3.2,.45,5.2)
    # The watch gallery is open between its structural posts and balustrades.
    for front in [-1,1]:
        for xx in [-1.26,0,1.26]:b('oaklight',x+xx,12.76,front*2.34,.20,2.11,.16)
        for y in [11.87,13.7]:b('oaklight',x,y,front*2.34,2.85,.20,.18)
        for i in range(5):b('gold',x-.72+i*.36,12.03,front*2.35,.08,.60,.11)
    for other in [-1,1]:
        for z in [-2.2,-.73,.73,2.2]:b('oaklight',x+other*1.38,12.75,z,.17,2.0,.17)
    m.roof(3.55,5.6,13.9,16.73,x=x)
    b('copper',x,16.90,0,.35,.22,5.65)
    for z in [-2.55,2.55]:b('gold',x,17.08,z,.29,.23,.29)
    m.part('shell-left' if side<0 else 'shell-right')
    m.lantern(x,5.9,2.91,1.55)
m.part('shell-front')
b('mortar',0,8.94,0,6.10,1.76,2.20)
for front in [-1,1]:
    stone_face(m,0,front*1.11,6.0,1.72,8.08,turn=0 if front>0 else math.pi,seed=5)
    for side in [-1,1]:
        for i in range(4):b('stoneedge',side*(2.86-i*.25),7.27+i*.22,front*1.03,.60,.35,.25)
    b('stoneedge',0,9.85,front*.97,6.4,.31,.58)
    b('oakdark',0,8.96,front*1.22,2.54,1.32,.17)
    b('teal',0,8.96,front*1.32,2.36,1.14,.07)
    if front>0:heraldry(m,'auction',0,8.97,1.40,.60)
m.finish()

# Stepped civic fountain with clear water facets and four falling streams.
m=Model('fountain',6,6);b=m.box
m.solid(0,0,6,6)
b('stoneshade',0,.12,0,6,.24,6)
b('stonebright',0,.32,0,5.72,.27,5.72)
b('watershade',0,.43,0,5.25,.10,5.25)
for side in [-1,1]:
    b('stone',side*2.64,.64,0,.32,.49,5.58)
    b('stone',0,.64,side*2.64,5.58,.49,.32)
    b('stonebright',side*2.68,.91,0,.46,.15,5.80)
    b('stonebright',0,.91,side*2.68,5.80,.15,.46)
for ix in range(7):
    for iz in range(7):
        m.part('water-pool',(0,.65,0))
        b('waterlight' if (ix*7+iz)%9==0 else 'water',-2.25+ix*.75,.65,-2.25+iz*.75,.73,.05,.73)
m.part('interior-furniture')
for width,y,height in [(1.50,.67,.18),(.89,1.38,1.30),(2.70,2.04,.24),(2.26,2.28,.24),(.71,2.86,1.0),(1.25,3.49,.24)]:
    b('stonebright',0,y,0,width,height,width)
for side in [-1,1]:
    for axis in [0,1]:
        x,z=(side*1.16,0) if axis==0 else (0,side*1.16)
        m.part('water-streams',(0,1.47,0))
        b('waterlight',x,1.47,z,.22,1.51,.22)
        m.part('water-ripples',(0,.73,0))
        for edge in [-1,1]:
            b('waterlight',x+edge*.27,.73,z,.05,.025,.54)
            b('waterlight',x,.73,z+edge*.27,.54,.025,.05)
m.part('interior-furniture')
for y,w in [(3.78,.58),(4.07,.86),(4.32,.55)]:b('gold',0,y,0,w,.27,w)
b('amber',0,4.46,0,.28,.13,.28)
m.finish()

# Grand trading hall: high windows, open portal, twin rear counters, central aisle.
m=Model('auction-hall',24,18);b=m.box;m.floor()
for side in [-1,1]:
    m.part('shell-left' if side<0 else 'shell-right')
    x=side*11.70;m.solid(x,0,.60,18)
    m.wall(18,x,0,side*math.pi/2,7,[(zz,2.5,2.725,5.175) for zz in [-6.45,-2.15,2.15,6.45]])
    for z in [-8.6,-4.3,0,4.3,8.6]:
        m.post(x,z,7,.64,True)
        b('oakdark',x,5.78,z,.74,.20,.76)
    for z in [-6.45,-2.15,2.15,6.45]:
        b('glass',x,3.95,z,.025,2.45,2.50)
        for dz in [-1.32,0,1.32]:b('oaklight',x+side*.35,3.95,z+dz,.15,2.71,.14)
        for y in [2.62,4.10,5.28]:b('oaklight',x+side*.35,y,z,.15,.14,2.81)
        b('stonebright',x+side*.37,2.42,z,.38,.25,3.02)
    for y in [.34,6.73]:b('oakdark',x,y,0,.78,.30,18)
    stone_face(m,side*12.008,0,17.90,1.10,.05,turn=side*math.pi/2,seed=2,depth=.025)
m.part('shell-back');m.solid(0,-8.70,24,.60)
m.wall(24,0,-8.70,math.pi,7)
for x in [-11.6,-7.75,-3.9,0,3.9,7.75,11.6]:m.post(x,-8.68,7,.54,True)
for y in [.34,6.73]:b('oakdark',0,y,-8.70,24,.30,.78)
stone_face(m,0,-9.008,23.90,1.10,.05,turn=math.pi,seed=4,depth=.025)
m.part('shell-front')
for side in [-1,1]:
    m.solid(side*7.5,8.7,9,.6)
    m.wall(9,side*7.5,8.7,0,7,[(side*xx-side*7.5,2.2,2.575,5.225) for xx in [5.3,9.3]])
    for x in [side*3.33,side*11.6]:m.post(x,8.68,7,.56,True)
    b('oakdark',side*7.5,.34,8.7,9,.30,.78)
    for x in [side*5.3,side*9.3]:
        b('glass',x,3.9,8.70,2.2,2.65,.025)
        for dx in [-1.17,0,1.17]:b('oaklight',x+dx,3.9,9.09,.15,2.87,.16)
        for y in [2.52,4.05,5.28]:b('oaklight',x,y,9.09,2.51,.15,.16)
        b('stonebright',x,2.30,9.18,2.75,.24,.40)
    m.lantern(side*3.65,4.6,9.52,1.5)
    stone_face(m,side*7.5,9.008,8.94,1.10,.05,seed=6,depth=.025)
    for x in [side*5.3,side*9.3]:
        for i in range(4):b('oaklight',x+side*(i-.5)*.21,5.62+i*.16,9.12,.43,.15,.13)
b('cream',0,6.56,8.7,6,1.12,.60)
b('oakdark',0,6.02,8.77,6.20,.22,.84)
b('oaklight',0,6.74,9.10,24.12,.32,.20)
# Gable fronts are walls; the actual roof is a separate cutaway mesh.
for label,z in [('shell-front',8.7),('shell-back',-8.7)]:
    m.part(label)
    for i in range(18):
        w=24*(1-i/18)
        b('plaster' if i%3==0 else 'cream',0,7.08+i*.30,z,w,.30,.50)
        b('oakdark',0,7.08+i*.30,z+math.copysign(.31,z),.27,.32,.16)
        for side in [-1,1]:b('oaklight',side*(w/2-.3),7.08+i*.30,z+math.copysign(.32,z),.72,.22,.14)
m.part('shell-front')
b('oakdark',0,8.02,9.16,4.40,2.55,.22)
b('teal',0,8.02,9.30,4.02,2.19,.12)
heraldry(m,'auction',0,8.02,9.47,1.12)
m.roof(25.2,19.1,7.17,12.72)
# Ridge lantern and ceremonial gold cap.
b('oakdark',0,13.04,0,.72,.56,.72)
m.lantern(0,13.47,0,1.20)
# Two tiled dormers and bright copper ridgework break the broad auction roof.
for side in [-1,1]:
    x=side*6.4
    for dx in [-.93,.93]:b('oakdark',x+dx,10.54,4.4,.64,1.55,1.78)
    for yy in [10.045,11.075]:b('oakdark',x,yy,4.4,2.50,.30,1.78)
    for dx in [-.55,.55]:b('oaklight',x+dx,10.56,5.30,.12,.94,.18)
    b('glass',x,10.56,5.30,.98,.71,.025)
    for dx in [-.56,0,.56]:b('gold',x+dx,10.56,5.426,.069,.92,.027)
    for yy in [10.09,11.04]:b('oaklight',x,yy,5.385,1.42,.14,.14)
    m.roof(3.15,2.25,11.18,12.14,x=x,z=4.4)
for z in [-9.05,0,9.05]:
    b('copper',0,12.88,z,.68,.16,.75)
    b('gold',0,13.15,z,.21,.40,.21)
m.part('interior-furniture')
b('teal',0,.012,0,5.25,.02,14.7)
for x in [-2.46,2.46]:b('gold',x,.027,0,.10,.005,14.4)
for side in [-1,1]:
    x=side*6.5;m.solid(x,-6.1,6,1.8)
    b('oakdark',x,.61,-6.1,6,1.22,1.8)
    b('oaklight',x,1.31,-6.1,6.0,.19,1.80)
    for dx in [-2.4,-1.2,0,1.2,2.4]:
        b('plank',x+dx,.61,-5.18,1.05,.95,.035)
        b('gold',x+dx,.88,-5.145,.11,.11,.04)
    b('linen',x,1.42,-5.91,1.12,.055,.58)
    for i in range(4):b('gold',x+1.0+i*.28,1.50,-6.12,.23,.20,.36)
    # Ledger stands and rear display shelving never block the central passage.
    m.solid(side*10.25,-5.6,1.30,4.9)
    for y in [.22,1.37,2.61,3.61]:b('oaklight',side*10.25,y,-5.6,1.28,.16,4.90)
    for z in [-8.02,-3.18]:b('oakdark',side*10.25,1.88,z,1.25,3.76,.16)
    for i in range(12):
        z=-7.8+i*.38
        b(['wine','teal','violet','linen'][i%4],side*10.15,2.04,z,.69,.97,.28)
        b('gold',side*9.79,2.11,z,.025,.09,.21)
    # Commission desk, lockboxes and displayed goods all stay atop existing counters.
    for dx in [-2.30,-1.46]:
        b('oakdark',x+dx,1.64,-6.38,.66,.48,.68)
        b('gold',x+dx,1.69,-6.02,.07,.30,.035)
        b('oaklight',x+dx,1.89,-6.38,.70,.065,.72)
    b('teal',x+.18,1.52,-5.74,.79,.10,.55)
    b('linen',x+.18,1.58,-5.74,.69,.022,.46)
    for dz in [-.12,0,.12]:b('oakdark',x+.15,1.596,-5.74+dz,.43,.006,.018)
    b('iron',x+.83,1.62,-5.74,.21,.31,.22)
    b('linen',x+.84,1.94,-5.74,.047,.44,.035)
    for i in range(4):
        b('linen',side*10.18,3.05,-7.30+i*.96,.65,.38,.64)
        b('teal',side*10.18,3.28,-7.30+i*.96,.69,.09,.68)
m.part('shell-back')
for side in [-1,1]:
    b('oakdark',side*6.5,4.53,-8.64,4.8,2.1,.08)
    b('teal',side*6.5,4.54,-8.575,4.55,1.86,.05)
    for i in range(6):
        b('linen',side*6.5-1.65+(i%3)*1.60,4.09+(i//3)*.88,-8.531,1.10,.63,.025)
        b('gold',side*6.5-1.65+(i%3)*1.60,4.35+(i//3)*.88,-8.51,.08,.08,.02)
m.finish()

# Three open guild pavilions with unmistakable class signs.
for role,roof,light in [('ranger','teal','rooflight'),('knight','wine','red'),('mage','violet','crystal')]:
    m=Model(role+'-pavilion',8,6);b=m.box;m.floor()
    m.part('shell-back');m.solid(0,-2.85,8,.30)
    b('cream',0,2.10,-2.85,8,4.2,.30)
    stone_face(m,0,-2.95,7.9,1.05,.03,turn=math.pi,seed=2,depth=.09)
    for x in [-2.8,-1.4,1.4,2.8]:
        b('oaklight',x,2.2,-2.95,.10,3.65,.10)
        for i in range(5):b('oak',x+(i-2)*.11,3.0+i*.14,-2.95,.19,.20,.10)
    for y in [.27,4.05]:b('oakdark',0,y,-2.78,8,.25,.35)
    for x in [-3.65,0,3.65]:b('oakdark',x,2.10,-2.80,.27,4.2,.32)
    for x in [-3.65,3.65]:
        m.part('shell-left' if x<0 else 'shell-right')
        for z in [-2.65,2.65]:
            m.post(x,z,4.35,.5);m.solid(x,z,.54,.54)
            for y in [.65,2.68,3.68]:b('iron',x,y,z,.53,.11,.53)
        b('oaklight',x,4.12,0,.35,.33,5.8)
    m.part('shell-front')
    b('oakdark',0,4.21,2.65,7.80,.38,.48)
    for side in [-1,1]:
        m.lantern(side*2.7,3.13,2.70,.8)
        for i in range(3):b('oaklight',side*(3.43-i*.23),3.76+i*.17,2.65,.50,.28,.35)
    b(roof,0,3.45,2.70,2.60,1.89,.16)
    for x in [-1.25,1.25]:b('gold',x,3.45,2.80,.075,1.92,.06)
    heraldry(m,role,0,3.47,2.85,.79)
    m.roof(8.70,6.65,4.38,6.26,roof,light)
    for side in [-1,1]:
        for i in range(5):b('oaklight',side*(1.71-i*.30),4.55+i*.26,3.30,.51,.17,.16)
    if role=='mage':
        for y,w in [(6.51,.35),(6.83,.60),(7.16,.30)]:b('crystal',0,y,0,w,.31,w)
        b('gold',0,6.39,0,.70,.15,.70)
    elif role=='ranger':
        b('oakdark',0,6.78,0,.12,.99,.12)
        b('gold',0,7.10,0,1.64,.12,.13)
        for i in range(3):b('gold',.64-i*.13,7.10+(i-1)*.11,0,.15,.12,.14)
    else:
        b('gold',0,6.83,0,.11,1.10,.11)
        b('wine',.53,7.15,0,.98,.45,.085)
        b('gold',.55,7.16,.055,.46,.085,.025)
        b('gold',.55,7.16,.055,.085,.32,.025)
    m.part('interior-furniture')
    m.solid(0,-1.70,4,1)
    b('oakdark',0,.55,-1.70,4,1.10,1)
    b('oaklight',0,1.18,-1.70,4,.16,1)
    b(roof,0,.57,-1.18,3.5,.87,.055)
    b('gold',0,.88,-1.14,.19,.19,.065)
    if role=='mage':
        for x in [-1.25,1.25]:
            b('gold',x,1.34,-1.70,.40,.14,.4)
            for y,w in [(1.57,.21),(1.82,.39),(2.09,.21)]:b('crystal',x,y,-1.7,w,.25,w)
    elif role=='knight':
        for x in [-1.25,1.25]:
            b('iron',x,1.50,-1.7,.85,.45,.55)
            b('stonebright',x,1.74,-1.7,1.05,.16,.65)
    else:
        for x in [-1.25,1.25]:
            b('oakdark',x,1.50,-1.70,.42,.53,.45)
            for i in range(4):b('linen',x-.14+i*.09,1.95,-1.70,.04,.69,.04)
    m.finish()

# Stable stalls open directly onto a wide, covered riding-school aisle.
m=Model('stable',16,10);b=m.box;m.floor()
m.part('shell-back');m.solid(0,-4.825,16,.35)
b('oakdark',0,1.10,-4.825,16,2.2,.35)
for x in range(-7,8):
    b('planklight' if x%3==0 else 'plank',x,1.12,-4.60,.93,2.20,.12)
for side in [-1,1]:
    m.part('shell-left' if side<0 else 'shell-right')
    m.solid(side*7.825,0,.35,10)
    b('oak',side*7.825,1.10,0,.35,2.20,10)
    for i in range(14):b('planklight' if i%4==0 else 'plank',side*7.95,1.13,-4.64+i*.71,.10,2.15,.67)
    for z in [-4.6,0,4.6]:
        m.post(side*7.64,z,4.8,.45);m.solid(side*7.64,z,.49,.49)
    b('oaklight',side*7.66,4.64,0,.40,.35,10)
m.part('shell-front')
b('oakdark',0,4.60,4.65,15.85,.48,.42)
b('teal',0,3.85,4.71,4.85,1.04,.15)
for x in [-2.35,2.35]:b('gold',x,3.85,4.82,.095,1.07,.07)
# A cream horseshoe silhouette on the hanging stable sign.
for side in [-1,1]:
    b('linen',side*.40,3.94,4.85,.20,.51,.13)
    b('linen',side*.28,3.63,4.85,.35,.19,.13)
b('linen',0,3.57,4.85,.38,.15,.13)
m.roof(16.8,10.7,4.92,7.13)
b('oakdark',0,7.62,0,2.4,1.05,2.5)
for side in [-1,1]:
    for y in [7.3,7.5,7.7,7.9]:
        b('oaklight',0,y,side*1.27,2.45,.085,.15)
        b('oaklight',side*1.22,y,0,.15,.085,2.55)
m.roof(3.05,3.10,8.13,9.12)
m.part('interior-furniture')
for x in [-2.6,2.6]:
    m.solid(x,-2.325,.22,4.65)
    for z in [-4.50,-.15]:m.post(x,z,2.4,.22)
    for y in [.58,1.37,2.18]:b('oaklight',x,y,-2.325,.22,.21,4.65)
for x in [-5.15,0,5.15]:
    m.solid(x,-3.85,2.7,1.0)
    b('oakdark',x,.42,-3.85,2.7,.84,1)
    b('water',x,.87,-3.85,2.44,.055,.76)
    for side in [-1,1]:b('oaklight',x+side*1.28,.96,-3.85,.15,.25,1.10)
    for z in [-4.31,-3.39]:b('oaklight',x,.96,z,2.70,.25,.16)
    b('amber',x,.10,-1.84,4.15,.19,2.14)
    for i in range(5):b('gold',x-1.70+i*.81,.21,-1.75, .55,.06,1.55)
for side in [-1,1]:m.lantern(side*6.5,3.55,4.68,1.05)
m.finish()

# Open market canopy with actual room for a merchant behind the counter.
m=Model('market-stall',8,4);b=m.box;m.floor()
for x in [-3.65,3.65]:
    m.part('shell-left' if x<0 else 'shell-right')
    for z in [-1.65,1.65]:m.post(x,z,3.65,.30);m.solid(x,z,.34,.34)
    b('oaklight',x,3.5,0,.25,.28,3.65)
m.part('roof-shingles')
for i in range(12):
    x=-3.85+(i+.5)*7.7/12
    for z,yy in [(-1.42,3.77),(0,4.02),(1.42,3.77)]:b('linen' if i%2 else 'teal',x,yy,z,7.7/12+.015,.30,1.46)
    b('gold' if i%2 else 'rooflight',x,3.47,2.11,7.7/12-.025,.54,.10)
    b('linen' if i%2 else 'teal',x,3.13+(i%2)*.07,2.11,.16,.17,.10)
b('copper',0,4.23,0,7.75,.12,.12)
m.part('interior-furniture');m.solid(0,-.80,6.4,.90)
b('oakdark',0,.52,-.80,6.4,1.04,.90)
b('oaklight',0,1.11,-.8,6.4,.14,.90)
for x in [-2.5,0,2.5]:
    b('plank',x,1.25,-.80,1.19,.18,.69)
    for i in range(4):b('leaflight' if x<0 else 'red' if x>0 else 'amber',x-.40+i*.27,1.45,-.80,.24,.22,.36)
for x in [-2.7,-1.5,0,1.5,2.7]:b('planklight',x,.55,-.325,.85,.84,.04)
for x in [-1.35,-.90,-.45]:
    b('blue',x,1.50,-.82,.27,.59,.27)
    b('gold',x,1.84,-.82,.15,.10,.15)
    b('linen',x,1.46,-.677,.20,.18,.021)
m.finish()

# High ashlar curtain wall: plinth, buttresses, coping and full-depth crenels.
m=Model('wall',8,2.4);b=m.box;m.part('shell-front');m.solid(0,0,8,2.4)
b('mortar',0,4.09,0,8,8.18,1.90)
for side in [-1,1]:
    stone_face(m,0,side*.991,8,7.94,.18,turn=0 if side>0 else math.pi,seed=7)
    for y in [.50,3.95,7.96]:b('stoneedge',0,y,side*1.01,8,.19,.28)
    # Shallow stepped buttresses remain entirely inside the 2.4m footprint.
    for x in [-3.55,3.55]:
        for i in range(4):
            b('limestone',x,.86+i*1.65,side*(1.11-i*.035),.73-i*.10,1.61,.18+i*.07)
            b('stoneedge',x,1.69+i*1.65,side*(1.095-i*.035),.80-i*.10,.13,.20+i*.07)
    for i in range(5):
        x=-3.2+i*1.6
        b('mortar',x,6.37,side*1.056,.21,.64,.021)
        b('stoneedge',x,6.79,side*1.07,.45,.12,.035)
    # A restrained compass engraving identifies the civic stonework.
    for dx,dy in [(0,.29),(.24,0),(0,-.29),(-.24,0)]:b('stoneedge',dx,5.15+dy,side*1.060,.14,.14,.023)
    b('moss',-2.80,.94,side*1.065,.36,.37,.030)
b('stoneedge',0,.20,0,8,.40,2.4)
b('limestone',0,8.20,0,8,.25,2.15)
b('stoneedge',0,8.43,0,8,.23,2.4)
for x in [-3.4,-1.7,0,1.7,3.4]:
    b('limestone',x,9.03,0,1.12,1.02,2.22)
    for front in [-1,1]:stone_face(m,x,front*1.125,1.12,.96,8.55,turn=0 if front>0 else math.pi,seed=2)
    b('stoneedge',x,9.63,0,1.22,.19,2.4)
m.finish()

# The civic clock rises above a broad, furnished town hall with a clear central aisle.
m=Model('clocktower',20,16);b=m.box;m.floor()
for side in [-1,1]:
    m.part('shell-left' if side<0 else 'shell-right');m.solid(side*9.7,0,.6,16)
    m.wall(16,side*9.7,0,side*math.pi/2,8,[(zz,1.73,3.205,5.835) for zz in [-5.7,-1.9,1.9,5.7]],True)
    for z in [-7.65,-3.85,0,3.85,7.65]:
        b('stoneedge',side*9.6975,3.95,z,.665,7.9,.36)
    for z in [-5.7,-1.9,1.9,5.7]:
        b('glass',side*9.7,4.52,z,.025,2.63,1.73)
        for dz in [-.85,0,.85]:b('gold',side*10.035,4.5,z+dz,.035,2.60,.065)
        for y in [3.17,4.45,5.81]:b('stoneedge',side*10.035,y,z,.04,.12,1.95)
        # Interior window reveals brighten the tall room without obstructing the floor.
        for dz in [-.95,.95]:b('oakdark',side*9.365,4.52,z+dz,.055,2.95,.15)
        for dz in [-.86,0,.86]:b('gold',side*9.30,4.50,z+dz,.03,2.65,.065)
        for y in [3.17,4.45,5.81]:b('oaklight',side*9.285,y,z,.06,.13,2.0)
    for y in [.28,2.02,6.23,7.79]:b('stoneedge',side*9.6875,y,0,.685,.24,16)
m.part('shell-back');m.solid(0,-7.7,20,.6)
b('mortar',0,4,-7.7,20,8,.6)
stone_face(m,0,-7.998,19.96,7.8,.10,turn=math.pi,seed=6,depth=.055)
for x in [-9.7,-5.1,0,5.1,9.7]:b('stoneedge',x,3.95,-7.6975,.34,7.9,.665)
for y in [.28,2.02,6.23,7.79]:b('stoneedge',0,y,-7.6875,20,.24,.685)
m.part('shell-front')
for side in [-1,1]:
    m.solid(side*6,7.7,8,.6)
    m.wall(8,side*6,7.7,0,8,[(side*xx-side*6,1.93,3.01,5.63) for xx in [4.12,7.97]],True)
    for x in [side*2.24,side*6.05,side*9.72]:
        b('stoneedge',x,3.94,7.6975,.46,7.88,.665)
        for y in [.44,2.0,5.77,7.67]:b('gold',x,y,8.04,.35,.095,.018)
    for x in [side*4.12,side*7.97]:
        b('glass',x,4.32,7.7,1.93,2.62,.025)
        for dx in [-1.01,0,1.01]:b('stoneedge',x+dx,4.30,8.04,.08,2.84,.032)
        for yy in [2.90,4.38,5.75]:b('gold',x,yy,8.048,2.17,.095,.024)
        b('stoneedge',x,2.75,8.08,2.42,.19,.19)
        b('teal',x,6.94,8.025,1.80,1.37,.036)
        for dx in [-.84,.84]:b('gold',x+dx,6.94,8.052,.063,1.38,.025)
        b('gold',x,6.94,8.08,.10,.68,.025)
        b('gold',x,6.94,8.08,.55,.10,.025)
    m.lantern(side*2.81,4.7,8.29,1.15)
    for y in [.28,2.02,7.79]:b('stoneedge',side*6,y,7.6875,8,.24,.685)
# The four-metre portal is empty from the floor to 5.4m.
b('stoneedge',0,5.77,7.70,4.0,.50,.60)
b('mortar',0,6.99,7.7,4.0,1.94,.6)
stone_face(m,0,7.998,4.0,1.91,6.04,seed=7,depth=.055)
for side in [-1,1]:
    for i in range(4):b('stoneedge',side*(1.83-i*.19),5.65+i*.19,7.72,.34,.27,.56)
b('oakdark',0,6.95,8.06,2.30,1.49,.10)
b('teal',0,6.95,8.125,2.11,1.31,.06)
heraldry(m,'auction',0,6.96,8.20,.61)

m.part('interior-floor')
# A gold-trimmed civic runner makes Rowan's approach unmistakable.
b('teal',0,.010,.80,3.5,.019,13.3)
for x in [-1.62,1.62]:b('gold',x,.028,.80,.075,.007,13.1)
for z in [-5.61,7.21]:b('gold',0,.03,z,3.26,.008,.10)
for x,z,w,d,tint in [(-5.55,-.5,7.5,8.5,'wine'),(5.7,3.6,5.1,4.5,'teal')]:
    b(tint,x,.011,z,w,.020,d)
    for side in [-1,1]:
        b('gold',x+side*(w/2-.16),.027,z,.065,.006,d-.28)
        b('gold',x,.027,z+side*(d/2-.16),w-.28,.006,.065)
        for dz in [-d/2+.36,d/2-.36]:b('linen',x+side*(w/2-.38),.031,z+dz,.15,.005,.15)

m.part('interior-furniture')
# Council table: paneled oak, brass corners, a runner and individual papers.
m.solid(-5.3,-.5,2.4,6.0)
b('oakdark',-5.3,1.11,-.5,2.4,.26,6.0)
b('oaklight',-5.3,1.265,-.5,2.38,.08,5.98)
for x in [-6.35,-4.25]:
    for z in [-2.88,1.88]:
        b('oakdark',x,.53,z,.30,1.06,.36)
        b('gold',x,.20,z,.33,.12,.39)
for z in [-2.60,1.60]:b('oak',-5.3,.34,z,2.38,.25,.22)
b('oak',-5.3,.38,-.5,.24,.24,5.0)
b('teal',-5.3,1.315,-.5,.80,.022,5.65)
for x in [-5.62,-4.98]:b('gold',x,1.329,-.5,.035,.006,5.62)
for z in [-2.5,0,2.05]:
    for side in [-1,1]:
        x=-5.3+side*.91
        b('linen',x,1.332,z,.52,.03,.69)
        for dz in [-.19,-.03,.13]:b('oaklight',x,1.35,z+dz,.34,.006,.016)
        b('wine',x+.16,1.37,z+.20,.09,.019,.09)
for z in [-2.8,1.8]:
    b('gold',-5.3,1.38,z,.31,.10,.31)
    b('gold',-5.3,1.58,z,.08,.32,.08)
    for dx in [-.26,0,.26]:
        b('gold',-5.3+dx,1.71,z,.09,.25,.09)
        b('linen',-5.3+dx,1.94,z,.12,.30,.12)
        b('amber',-5.3+dx,2.13,z,.067,.10,.067)
    b('gold',-5.3,1.63,z,.61,.075,.09)
# Rowan stands in front of this desk at (0,-4), away from every collider.
m.solid(0,-6,4.8,1.6)
b('oakdark',0,.59,-6,4.8,1.18,1.6)
b('oaklight',0,1.255,-6,4.8,.15,1.6)
for x in [-1.8,-.6,.6,1.8]:
    b('plank',x,.64,-5.185,1.07,.91,.045)
    for y in [.30,.94]:b('oaklight',x,y,-5.150,1.11,.07,.05)
    b('gold',x,.80,-5.113,.08,.08,.035)
for x in [-1.8,1.8]:
    b('oakdark',x,1.48,-6.10,.55,.29,.48)
    b('gold',x,1.49,-5.845,.07,.22,.035)
b('teal',-.5,1.375,-5.92,1.43,.09,.92)
b('linen',-.5,1.434,-5.92,1.31,.022,.80)
for z in [-6.16,-6.01,-5.86,-5.71]:b('oaklight',-.58,1.45,z,.94,.008,.019)
b('wine',-.01,1.46,-5.70,.15,.019,.14)
b('iron',.60,1.45,-5.88,.22,.25,.24)
b('linen',.60,1.82,-5.87,.034,.56,.032)
for i in range(4):
    b('linen',.90,1.39+i*.12,-6.1,.66,.11,.40)
    b('wine',.90,1.45+i*.12,-6.1,.10,.017,.42)

# Tall archives along the side walls: shelves, spines, gold labels, document bundles.
for x,z,depth in [(8.65,-1.5,7.2),(-8.65,-4.8,3.5)]:
    m.solid(x,z,1.1,depth)
    side=1 if x>0 else -1
    b('oakdark',x+side*.48,1.91,z,.13,3.82,depth)
    for y in [.16,1.19,2.24,3.28,3.82]:b('oaklight',x,y,z,1.1,.15,depth)
    for dz in [-depth/2+.07,depth/2-.07]:b('oakdark',x,1.99,z+dz,1.10,3.96,.14)
    for shelf in range(3):
        for i in range(int((depth-.35)/.28)):
            zz=z-depth/2+.28+i*.28
            height=.65+(i%4)*.055
            b(['wine','teal','violet','linen','oaklight'][(i+shelf)%5],x-side*.08,.30+shelf*1.045+height/2,zz,.78,height,.225)
            for dy in [-.19,.19]:b('gold',x-side*.482,.30+shelf*1.045+height/2+dy,zz,.025,.035,.18)
    for i in range(int(depth/1.02)):
        zz=z-depth/2+.60+i*1.02
        b('linen',x,3.48,zz,.75,.22,.66)
        b('teal',x,3.61,zz,.79,.06,.70)
        b('gold',x-side*.40,3.51,zz,.025,.10,.20)
# Rear archive cabinet and a reading desk keep the eastern wing useful.
m.solid(5.7,-6.6,4.2,1.2)
b('oakdark',5.7,.78,-6.6,4.2,1.56,1.2)
b('oaklight',5.7,1.61,-6.6,4.2,.15,1.2)
for x in [4.1,5.17,6.23,7.3]:
    for y in [.34,.83,1.30]:
        b('plank',x,y,-5.972,.92,.40,.055)
        b('gold',x,y,-5.932,.27,.035,.055)
        b('linen',x,y+.095,-5.929,.19,.075,.02)
for x in [4.2,5.3,7.1]:
    b('linen',x,1.80,-6.60,.67,.24,.70)
    b('wine',x,1.94,-6.60,.72,.065,.73)
m.solid(5.7,2.8,3.2,1.6)
b('oakdark',5.7,1.16,2.8,3.2,.20,1.6)
b('oaklight',5.7,1.29,2.8,3.2,.09,1.6)
for x in [4.35,7.05]:
    for z in [2.2,3.4]:b('oakdark',x,.54,z,.22,1.08,.22)
for x in [4.9,6.5]:
    b('teal',x,1.37,2.92,1.07,.08,.78)
    for side in [-1,1]:
        b('linen',x+side*.235,1.432,2.92,.43,.037,.67)
        for dz in [-.18,0,.18]:b('oaklight',x+side*.235,1.454,2.92+dz,.30,.006,.018)
b('iron',5.7,1.43,2.36,.19,.23,.19)
b('linen',5.7,1.74,2.36,.025,.43,.025)
# Eight independently targetable seats use the established .8m sitting height.
chair_positions=[(x,z,turn) for z in [-2.5,0,2.5] for x,turn in [(-8.85,math.pi/2),(-2.15,-math.pi/2)]]
chair_positions += [(4.9,5.4,math.pi),(6.5,5.4,math.pi)]
for index,(x,z,turn) in enumerate(chair_positions):
    m.part('interior-chair-'+str(index),(x,0,z));m.solid(x,z,.85,.85)
    c,s=math.cos(turn),math.sin(turn)
    def seat(t,xx,y,zz,w,h,d):b(t,x+xx*c+zz*s,y,z-xx*s+zz*c,w,h,d,turn)
    seat('oakdark',0,.68,0,.85,.20,.85)
    seat('wine',0,.789,.02,.71,.022,.69)
    for side in [-1,1]:
        for zz in [-.31,.31]:seat('oak',side*.31,.31,zz,.14,.62,.14)
        seat('oaklight',side*.34,1.04,-.34,.115,1.16,.13)
        seat('oak',side*.31,.27,0,.085,.09,.68)
        seat('gold',side*.34,1.52,-.25,.055,.055,.045)
    for yy in [1.03,1.43]:seat('oaklight',0,yy,-.34,.75,.13,.13)
    for xx in [-.20,0,.20]:seat('oak',xx,1.23,-.34,.095,.33,.105)
m.part('interior-furniture')
for x in [-8.5,8.5]:
    m.solid(x,5.8,1,1)
    b('stonebright',x,.38,5.8,.82,.76,.82)
    b('copper',x,.79,5.8,1,.16,1)
    b('oakdark',x,.90,5.8,.13,.40,.13)
    for dx,dz,y,w in [(-.20,0,1.16,.62),(.22,.13,1.35,.65),(0,-.19,1.57,.60),(0,0,1.80,.48)]:
        b('leaflight' if y>1.5 else 'leaf',x+dx,y,5.8+dz,w,.48,w)
# Warm wall lanterns, civic banners, and a framed district map give the room a purpose.
for x in [-8.95,8.95]:
    for z in [-5.4,1.7,6.5]:m.lantern(x,4.10,z,.90)
m.part('shell-back')
for x,tint in [(-3.1,'teal'),(3.1,'wine')]:
    b('oakdark',x,5.65,-7.31,1.89,3.49,.08)
    b(tint,x,5.66,-7.248,1.67,3.23,.045)
    for dx in [-.77,.77]:b('gold',x+dx,5.66,-7.211,.05,3.23,.024)
    b('gold',x,7.38,-7.20,2.08,.13,.16)
    heraldry(m,'auction',x,5.75,-7.16,.66)
    for i in range(5):b('gold',x-.62+i*.31,3.98,-7.21,.065,.21,.04)
b('oakdark',-6.4,4.70,-7.32,3.57,2.81,.10)
b('gold',-6.4,4.70,-7.25,3.39,2.63,.045)
b('linen',-6.4,4.70,-7.212,3.22,2.46,.035)
for x,y,w,h,tint in [(-7.28,5.2,1.02,.49,'leaf'),(-6.77,4.74,.52,.80,'leaflight'),(-5.62,4.97,.91,.95,'leaf'),(-6.06,4.14,.90,.46,'leaflight')]:b(tint,x,y,-7.184,w,h,.023)
for i in range(11):b('water',-7.68+i*.24,5.63-i*.18,-7.158,.26,.16,.019)
for x,y in [(-7.02,4.28),(-6.35,5.24),(-5.63,4.50)]:
    b('wine',x,y,-7.139,.13,.13,.018)
    b('gold',x,y,-7.124,.051,.051,.012)
# Keep the original animated pendulum as the keeper's working clock.
m.part('interior-pendulum',(0,5.5,-7.28))
b('gold',0,4.69,-7.28,.075,1.62,.06)
b('oakdark',0,3.79,-7.28,.52,.52,.12)
b('gold',0,3.79,-7.20,.38,.38,.055)
m.part('shell-back')
b('oakdark',0,5.55,-7.39,1.28,1.17,.075)
b('linen',0,5.56,-7.337,1.03,.92,.03)
b('gold',0,5.56,-7.307,.12,.58,.026)
b('gold',.18,5.55,-7.307,.42,.09,.025)

# Everything above the usable civic ground floor hides with the roof.
m.part('roof-base-coping')
b('stoneedge',0,8.13,0,20.6,.30,16.6)
for i in range(8):
    width,depth=20.8-i*1.70,16.8-i*1.20
    b('teal' if i%2 else 'verdigris',0,8.38+i*.28,0,width,.32,depth)
    for side in [-1,1]:
        b('copper',side*(width/2-.05),8.51+i*.28,0,.12,.07,depth)
        b('copper',0,8.51+i*.28,side*(depth/2-.05),width,.07,.12)
# Copper-capped dormers and civic pennants articulate the broad town hall roof.
for x in [-6.2,6.2]:
    for dx in [-1.0,1.0]:b('oakdark',x+dx,10.02,5.61,.50,1.70,1.55)
    for yy,hh in [(9.38,.42),(10.70,.34)]:b('oakdark',x,yy,5.61,2.50,hh,1.55)
    for dx in [-.66,.66]:b('oaklight',x+dx,10.08,6.405,.12,1.03,.18)
    b('glass',x,10.08,6.35,1.20,.87,.025)
    for dx in [-.57,0,.57]:b('gold',x+dx,10.08,6.50,.052,.91,.02)
    b('stoneedge',x,9.45,6.44,2.47,.15,.16)
    m.roof(3.12,2.13,10.91,11.98,x=x,z=5.6)
    b('copper',x,12.08,5.6,.35,.10,2.19)
    b('gold',x,12.38,5.65,.075,.63,.075)
    b('teal',x+.36,12.52,5.65,.68,.34,.05)
m.part('roof-tower-shaft')
b('mortar',0,14.39,0,8.50,9.8,8.50)
for angle in [0,math.pi/2,math.pi,math.pi*1.5]:
    c,s=math.cos(angle),math.sin(angle)
    stone_face(m,4.265*s,4.265*c,8.48,9.30,9.75,turn=angle,seed=3,depth=.045)
    for side in [-1,1]:
        x,z=side*4.12*c+4.18*s,-side*4.12*s+4.18*c
        b('stoneedge',x,14.38,z,.32,9.76,.32)
    # Narrow pilasters frame the dials without flattening the tall shaft.
    for yy in [10.02,11.27,19.03]:b('stoneedge',4.28*s,yy,4.28*c,8.72,.22,.25,angle)
    for side in [-1,1]:
        x,z=side*2.95*c+4.3*s,-side*2.95*s+4.3*c
        b('shadow',x,12.8,z,.30,1.9,.045,angle)
        b('gold',x,13.79,z,.57,.12,.065,angle)

m.part('roof-clockfaces')
for angle in [0,math.pi/2,math.pi,math.pi*1.5]:
    c,s=math.cos(angle),math.sin(angle);yc=16.25
    def clock_box(t,x,y,offset,w,h,d):b(t,x*c+offset*s,yc+y,-x*s+offset*c,w,h,d,angle)
    for tint,r,offset,depth in [('oakdark',2.49,4.37,.20),('copper',2.35,4.49,.17),('gold',2.18,4.59,.10),('shadow',2.05,4.665,.060),('linen',1.87,4.707,.035)]:
        m.disc(tint,offset*s,yc,offset*c,r,depth,angle)
    for hour in range(12):
        a=hour*math.tau/12;x,y=math.sin(a)*1.69,math.cos(a)*1.69
        clock_box('oakdark',x,y,4.739,.28 if abs(x)>abs(y) else .11,.11 if abs(x)>abs(y) else .28,.028)
    for sign,length in [(-1,1.05),(1,1.42)]:
        for i in range(12):
            f=i/11;clock_box('iron',sign*.866*length*f,.50*length*f,4.78,.17,.17,.06)
    clock_box('gold',0,0,4.83,.29,.29,.08)
    for side in [-1,1]:
        crest_bracket(m,side*2.8*c+4.30*s,18.27,-side*2.8*s+4.30*c,angle)

m.part('roof-bell-arcade')
for width,yy,height in [(9.10,19.43,.44),(8.2,19.83,.33),(6.2,20.12,.28)]:b('stoneedge',0,yy,0,width,height,width)
for x in [-2.72,2.72]:
    for z in [-2.72,2.72]:
        b('oakdark',x,22.12,z,.62,4.14,.62)
        for yy in [20.23,21.13,23.89]:b('gold',x,yy,z,.70,.19,.70)
for side in [-1,1]:
    b('oaklight',0,23.87,side*2.72,6.12,.41,.62)
    b('oaklight',side*2.72,23.87,0,.62,.41,6.12)
    for i in range(6):
        b('copper',side*2.72,20.55,-2.17+i*.87,.16,.67,.12)
        b('copper',-2.17+i*.87,20.55,side*2.72,.12,.67,.16)
    b('copper',side*2.72,20.85,0,.20,.12,5.7)
    b('copper',0,20.85,side*2.72,5.7,.12,.20)
b('oakdark',0,23.72,0,.52,.30,5.57)
for i,width in enumerate([.64,.84,1.08,1.24,1.52,1.82,2.35]):b('copper' if i%2 else 'gold',0,23.05-i*.23,0,width,.27,width)
b('shadow',0,21.47,0,2.10,.06,2.10)
b('gold',0,21.39,0,.30,.80,.30)

m.part('roof-shingles')
for i in range(24):
    width=7.25*(1-i/24)+.18;y=24.12+i*.275
    b('verdigris' if i%4==0 else 'teal',0,y,0,width,.32,width)
    for side in [-1,1]:
        b('copper',side*(width/2-.08),y+.13,side*(width/2-.08),.17,.07,.17)
        b('copper',side*(width/2-.08),y+.13,-side*(width/2-.08),.17,.07,.17)
b('gold',0,30.86,0,.28,.61,.28)
b('gold',0,31.17,0,1.22,.12,.12)
b('gold',0,31.17,0,.12,.12,1.22)
b('amber',0,31.53,0,.23,.35,.23)
m.finish()

m=Model('lantern',.70,.70);m.part('interior-furniture');m.solid(0,0,.58,.58)
m.box('stonebright',0,.16,0,.58,.32,.58)
m.box('oakdark',0,1.65,0,.20,2.98,.20)
m.box('gold',0,.61,0,.26,.15,.26)
m.lantern(0,3.45,0,1.12)
m.finish()

# Auctioneer uses the existing four-part villager proportions and head/shoulder pivots.
m=Model('auctioneer',1.1,.75);b=m.box;m.part('body')
for side in [-1,1]:
    b('oakdark',side*.19,.11,.065,.29,.22,.48)
    b('shadow',side*.19,.44,0,.25,.50,.31)
    b('gold',side*.19,.24,.235,.12,.04,.04)
b('wine',0,1.07,0,.70,.89,.43)
b('red',0,.64,.015,.80,.20,.49)
b('oakdark',0,.92,.034,.73,.11,.47)
b('gold',0,.92,.282,.13,.13,.055)
b('linen',0,1.38,.255,.20,.29,.07)
b('gold',0,1.37,.309,.40,.10,.06)
for side in [-1,1]:
    b('red',side*.36,1.48,0,.19,.20,.49)
    b('gold',side*.235,1.16,.262,.065,.49,.06)
for y in [.67,.78,1.05,1.19]:b('gold',0,y,.27,.075,.075,.045)
m.part('head',(0,1.64,0))
b('skin',0,1.86,.025,.62,.56,.55)
for side in [-1,1]:b('skin',side*.337,1.86,.025,.10,.17,.19)
b('hair',0,2.16,-.025,.67,.17,.59)
b('hair',0,1.99,-.26,.66,.30,.11)
for side in [-1,1]:
    b('hair',side*.284,2,.09,.10,.19,.25)
    b('shadow',side*.15,1.92,.308,.073,.076,.034)
    b('linen',side*.162,1.945,.331,.025,.022,.015)
b('skinlight',0,1.83,.338,.11,.11,.10)
b('hair',0,1.75,.312,.39,.095,.055)
b('hair',0,1.68,.256,.28,.15,.17)
b('oakdark',0,2.26,-.015,.78,.14,.66)
b('wine',-.06,2.41,-.015,.55,.19,.51)
b('gold',0,2.33,.26,.62,.06,.06)
b('gold',.19,2.35,.32,.09,.13,.035)
for side,label in [(-1,'left-arm'),(1,'right-arm')]:
    m.part(label,(side*.47,1.48,0))
    b('wine',side*.48,1.24,.01,.23,.47,.35)
    b('gold',side*.49,1.01,.035,.24,.12,.36)
    b('skin',side*.49,.87,.06,.20,.21,.24)
    if side==1:
        b('oaklight',.49,.83,.18,.10,.10,.52)
        b('oakdark',.49,.83,.45,.31,.29,.19)
        b('gold',.49,.83,.46,.33,.09,.21)
    else:
        b('teal',-.49,.90,.18,.33,.43,.12)
        b('linen',-.49,.90,.25,.28,.37,.025)
m.finish()

for path in [EXPORT.parent,SOURCE.parent]:path.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,
                         export_yup=True,export_apply=True,export_animations=False,
                         export_cameras=False,export_lights=False,export_extras=True)
if '--optimize' in sys.argv:
    cli=['npx','--yes','@gltf-transform/cli@4.5.0']
    with tempfile.TemporaryDirectory(prefix='mossvale-city-') as temporary:
        paths=[str(EXPORT)]+[str(Path(temporary)/f'{i}.glb') for i in range(3)]
        for command in [['weld',paths[0],paths[1]],
                        ['quantize',paths[1],paths[2],'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],
                        ['dedup',paths[2],paths[3]],['prune',paths[3],paths[0]]]:
            subprocess.run(cli+command,check=True)
    raw=EXPORT.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
    document=json.loads(raw[20:20+length])
    for field in ['extensionsUsed','extensionsRequired']:
        document[field]=sorted(set(document.get(field,[])+['KHR_mesh_quantization']))
    encoded=json.dumps(document,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4)
    tail=raw[20+length:]
    EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+
                       struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)
    # Quantize only static architecture positions. The auctioneer retains its exact
    # authored shoulder/head pivots and float positions for the runtime animation rig.
    # These are build-time SDK modules already installed by the pinned CLI above.
    cache=Path(subprocess.check_output(['npm','config','get','cache'],text=True).strip())
    sdk=next(path.parent.parent for path in cache.glob('_npx/*/node_modules/@gltf-transform/core/package.json')
             if json.loads(path.read_text()).get('version')=='4.5.0')
    modules={name:(sdk/name/'dist/index.js').as_uri() for name in ['core','extensions','functions']}
    optimizer="""
import { Document, NodeIO, VertexLayout } from CORE;
import { ALL_EXTENSIONS } from EXTENSIONS;
import { copyToDocument, quantize, dedup, prune, unpartition } from FUNCTIONS;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setVertexLayout(VertexLayout.SEPARATE);
const source = await io.read(process.argv[2]);
const doc = new Document();
for (const extension of source.getRoot().listExtensionsUsed())
  doc.createExtension(extension.constructor).setRequired(extension.isRequired());
const roots = source.getRoot().getDefaultScene().listChildren();
const staticRoots = roots.filter(node => node.getName() !== 'city-auctioneer');
const npc = roots.find(node => node.getName() === 'city-auctioneer');
const scene = doc.createScene('Lanternreach capital library');
const copied = copyToDocument(doc, source, staticRoots);
for (const root of staticRoots) scene.addChild(copied.get(root));
await doc.transform(quantize({pattern:/POSITION/, quantizePosition:16}));
scene.addChild(copyToDocument(doc, source, [npc]).get(npc));
await doc.transform(unpartition(), dedup(), prune());
await io.write(process.argv[2], doc);
"""
    for name,url in modules.items():optimizer=optimizer.replace('from '+name.upper()+';', 'from '+json.dumps(url)+';')
    with tempfile.TemporaryDirectory(prefix='mossvale-city-quantize-') as temporary:
        script=Path(temporary)/'optimize.mjs';script.write_text(optimizer)
        subprocess.run(['node',str(script),str(EXPORT)],check=True)

# Editable capital study: arranged at city scale, plus a furnished hall cutaway.
gallery=bpy.data.scenes.new('Lanternreach city study')
bpy.context.window.scene=gallery
places={'auction-hall':(0,0,-13),'gate':(0,0,24),'fountain':(0,0,6),
        'ranger-pavilion':(-22,0,3),'knight-pavilion':(-22,0,14),'mage-pavilion':(-22,0,-8),
        'stable':(22,0,-10),'market-stall':(19,0,10),'auctioneer':(12.5,0,16),
        'wall':(-11,0,25),'lantern':(8,0,18),'clocktower':(-16,0,-31)}
for root in roots:
    parent=root.copy();gallery.collection.objects.link(parent)
    parent.location=xyz(*places[root.name.removeprefix('city-')])
    for child in root.children:
        obj=child.copy();obj.data=child.data;gallery.collection.objects.link(obj);obj.parent=parent
# A second hall showcases real furniture and circulation alongside the complete facade.
root=next(root for root in roots if root.name=='city-auction-hall')
parent=root.copy();gallery.collection.objects.link(parent);parent.location=xyz(42,0,23)
for child in root.children:
    if child.get('part','').startswith(('roof-','shell-front','shell-right')):continue
    obj=child.copy();obj.data=child.data;gallery.collection.objects.link(obj);obj.parent=parent
bpy.ops.mesh.primitive_plane_add(size=300,location=(0,0,-.51))
ground=bpy.context.object;ground.name='Gallery paving - not exported'
gm=bpy.data.materials.new('Lanternreach gallery paving');gm.diffuse_color=(.095,.12,.105,1)
ground.data.materials.append(gm)
def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(79,70,104))
camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=118
aim(camera,(8,9,4));gallery.camera=camera
for at,power,size in [((-24,35,22),18000,26),((35,26,-10),10000,18)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*at))
    light=bpy.context.object;light.data.energy=power;light.data.size=size;aim(light,(0,2,0))
bpy.ops.object.light_add(type='SUN',location=xyz(-15,24,16))
sun=bpy.context.object;sun.data.energy=2;sun.data.angle=.18;aim(sun,(0,0,0))
gallery.world=bpy.data.worlds.new('Lanternreach daylight');gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.15,.20,.23,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
gallery.render.engine='CYCLES';gallery.cycles.samples=24;gallery.cycles.use_denoising=True
gallery.render.resolution_x=2000;gallery.render.resolution_y=1500;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.render.filepath=str(PREVIEW)
gallery.view_settings.view_transform='AgX'
# Focused authoring scenes keep both the silhouette and inhabited room reviewable.
studies=[]
clocktower=next(root for root in roots if root.name=='city-clocktower')
for label,cutaway,at,target,scale in [
    ('exterior',False,(37,31,48),(0,14,0),43),
    ('interior',True,(-25,29,33),(0,2.2,0),30),
]:
    study=bpy.data.scenes.new('Town hall '+label)
    bpy.context.window.scene=study
    parent=clocktower.copy();study.collection.objects.link(parent)
    for child in clocktower.children:
        part=child.get('part','')
        if cutaway and part.startswith(('roof-','shell-front','shell-left')):continue
        obj=child.copy();obj.data=child.data;study.collection.objects.link(obj);obj.parent=parent
    bpy.ops.mesh.primitive_plane_add(size=500,location=(0,0,-.52))
    bpy.context.object.name='Town hall studio paving - not exported'
    bpy.context.object.data.materials.append(gm)
    bpy.ops.object.camera_add(location=xyz(*at))
    cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=scale;aim(cam,target);study.camera=cam
    for pos,power,size in [((-16,30,20),14000,18),((18,20,-12),9000,14)]:
        bpy.ops.object.light_add(type='AREA',location=xyz(*pos))
        lamp=bpy.context.object;lamp.data.energy=power;lamp.data.size=size;aim(lamp,(0,3,0))
    if cutaway:
        for pos in [(-5.3,4.8,-.5),(5.7,4.5,2.8),(0,5,-5.5)]:
            bpy.ops.object.light_add(type='AREA',location=xyz(*pos))
            lamp=bpy.context.object;lamp.data.energy=90;lamp.data.color=(1,.68,.32);lamp.data.size=3;aim(lamp,(pos[0],0,pos[2]))
    bpy.ops.object.light_add(type='SUN',location=xyz(-15,24,16))
    lamp=bpy.context.object;lamp.data.energy=1.7;lamp.data.angle=.18;aim(lamp,(0,0,0))
    study.world=gallery.world;study.render.engine='CYCLES';study.cycles.samples=32;study.cycles.use_denoising=True
    study.render.resolution_x=1600;study.render.resolution_y=1600;study.render.resolution_percentage=100
    study.render.image_settings.file_format='PNG';study.render.filepath=str(SOURCE.parent/('town-hall-'+label+'.png'))
    study.view_settings.view_transform='AgX';studies.append(study)
bpy.context.window.scene=gallery
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('CITY_ASSETS '+json.dumps({'models':stats,'glb_bytes':EXPORT.stat().st_size,'blend_bytes':SOURCE.stat().st_size}))
if '--render' in sys.argv:
    for scene in [gallery]+studies:
        bpy.context.window.scene=scene
        bpy.ops.render.render(write_still=True)
