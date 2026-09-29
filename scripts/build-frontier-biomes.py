"""Original Mossvale frontier exteriors and foliage, authored in Blender.

Blender --background --python scripts/build-frontier-biomes.py -- --render
Exterior roots replace only shell-* / roof-* on the original house interiors.
Metres, Y up, +Z front; every exported root remains at the ground origin.
"""
import bpy
import json
import math
import random
import subprocess
import sys
import tempfile
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from blender_mesh_utils import remove_hidden_box_faces
EXPORT = ROOT / 'public/models/frontier-biomes.glb'
SOURCE = ROOT / 'assets/source/frontier-biomes.blend'
PREVIEW = ROOT / 'assets/source/frontier-biomes-preview.png'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
library = bpy.context.scene
library.name = 'Mossvale frontier biome library'
library.unit_settings.system = 'METRIC'

def xyz(x,y,z): return x,-z,y
def linear(v): return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
HEX = {
    'sand':'D5AE73','sandlight':'E9CB8F','sanddark':'AE804E','chalk':'F1DCAA','mortar':'96704B',
    'terracotta':'BA704B','copper':'B97D4B','copperlight':'D49F61','gold':'E5BD68','linen':'E6D5AC',
    'teal':'277F83','teallight':'51A5A2','tealdark':'1C555C','blue':'519EA6',
    'oak':'684534','oaklight':'9B6C43','oakdark':'3E3028','plank':'80573A','bamboo':'B4A35E',
    'jungleplaster':'A6926E','leaf':'3D7941','leaflight':'75A94D','leafdark':'23573D','lime':'98BE57',
    'jade':'388669','moss':'638448','fern':'60A14D','ferntip':'91BE61','flower':'CF7551',
    'cactus':'648F59','cactuslight':'9AB76A','cactusdark':'47754D','spine':'E1D6A3',
    'rock':'AE7954','rocklight':'C29468','rockdark':'875D49','fruit':'CD9151','black':'233D35',
    'autumn':'B67737','autumnlight':'D19A4B','autumndark':'80502E','snow':'DCE8E5','snowshade':'AFCBD2',
    'slate':'547789','slatedark':'354E5E','frostwood':'635447','frostlight':'A1957A',
    'rootstone':'626164','rootdark':'3D3E47','rootlight':'858079','violet':'685378','violetlight':'9B80B2',
}
PALETTE = {key:tuple(linear(int(value[i:i+2],16)/255) for i in (0,2,4))+(1,) for key,value in HEX.items()}
material=bpy.data.materials.new('Frontier shared vertex palette');material.use_nodes=True
shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.88
colour=material.node_tree.nodes.new('ShaderNodeVertexColor');colour.layer_name='FrontierTint'
material.node_tree.links.new(colour.outputs['Color'],shader.inputs['Base Color'])
glass=material.copy();glass.name='Frontier clear window glass'
glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.20
glass.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.18
glass.surface_render_method='DITHERED'
roots=[];stats={}

class Model:
    def __init__(self,name,footprint):
        self.name=name;self.footprint=footprint;self.parts={};self.solids=[];self.part('decoration')
    def part(self,name):
        self.current_name=name
        self.current=self.parts.setdefault(name,{'vertices':[],'faces':[],'colors':[],'boxes':[]})
    def poly(self,tint,vertices,faces):
        p=self.current;n=len(p['vertices']);p['vertices'] += [xyz(*v) for v in vertices]
        p['faces'] += [tuple(n+i for i in f) for f in faces];p['colors'] += [PALETTE[tint]]*len(faces)
    def box(self,tint,x,y,z,w,h,d,turn=0):
        if tint=='glass':
            name=self.current_name;self.part(name+'-glass')
            self.box('blue',x,y,z,w,h,d,turn);self.part(name);return
        c,s=math.cos(turn),math.sin(turn)
        self.poly(tint,[(x+a*w/2*c+f*d/2*s,y+b*h/2,z-a*w/2*s+f*d/2*c)
            for a,b,f in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],
            [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
        vertices=self.current['vertices'][-8:]
        if abs(math.sin(turn*2))<1e-8:
            self.current['boxes'].append((tuple(min(v[a] for v in vertices) for a in range(3)),tuple(max(v[a] for v in vertices) for a in range(3)),len(self.current['faces'])-6))
    def beam(self,tint,start,end,width,depth=None):
        a,b=Vector(start),Vector(end);direction=(b-a).normalized()
        side=direction.cross(Vector((0,0,1)))
        if side.length<.01:side=direction.cross(Vector((1,0,0)))
        side.normalize();up=direction.cross(side).normalized();depth=depth or width
        verts=[tuple(p+side*u*width/2+up*v*depth/2) for p in (a,b) for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        self.poly(tint,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
    def leaf(self,tint,start,end,width):
        a,b=Vector(start),Vector(end);along=b-a;side=Vector((-along.z,0,along.x)).normalized()*width/2
        centre=a+along*.47;lift=Vector((0,width*.13,0))
        verts=[tuple(a),tuple(centre+side),tuple(b),tuple(centre-side),tuple(centre+lift),tuple(centre-lift*.35)]
        self.poly(tint,verts,[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)])
    def finish(self,kind='prop'):
        parent=bpy.data.objects.new('frontier-'+self.name,None);library.collection.objects.link(parent)
        parent['contract']='Metres; Y up; +Z front; ground origin. Exterior replaces old shell-* and roof-* only.'
        parent['assetKind']=kind;parent['width'],parent['depth']=self.footprint
        parent['solidFootprints']=json.dumps(self.solids,separators=(',',':'))
        if kind=='exterior':parent['doorWidth']=2.8;parent['doorHeight']=3.6
        triangles=0
        for name,p in self.parts.items():
            if not p['faces']:continue
            remove_hidden_box_faces(p)
            mesh=bpy.data.meshes.new(self.name+'-'+name);mesh.from_pydata(p['vertices'],[],p['faces']);mesh.materials.append(glass if name.endswith('-glass') else material)
            tint=mesh.color_attributes.new(name='FrontierTint',type='BYTE_COLOR',domain='CORNER')
            for face,col in zip(mesh.polygons,p['colors']):
                for index in face.loop_indices:tint.data[index].color=col
            mesh.update();obj=bpy.data.objects.new('frontier-'+self.name+'-'+name,mesh)
            library.collection.objects.link(obj);obj.parent=parent;obj['part']=name
            triangles+=sum(len(f)-2 for f in p['faces'])
        roots.append(parent)
        stats[self.name]={'triangles':triangles,'draws':len(parent.children),'footprint':self.footprint,'solids':self.solids}
        return parent

def walls(m,biome,w,d,h):
    for name,length,x,z,turn,door in [('front',w,0,d/2,0,True),('back',w,0,-d/2,math.pi,False),
         ('left',d,-w/2,0,-math.pi/2,False),('right',d,w/2,0,math.pi/2,False)]:
        m.part('shell-'+name);c,s=math.cos(turn),math.sin(turn)
        def b(tint,dx,y,dz,ww,hh,dd):m.box(tint,x+dx*c+dz*s,y,z-dx*s+dz*c,ww,hh,dd,turn)
        openings=[(-length*.30,1.45,1.9,3.65),(length*.30,1.45,1.9,3.65)]
        if door:openings.append((0,2.8,0,3.6))
        edges=sorted(set([-length/2,length/2]+[v for a,ww,_,_ in openings for v in (a-ww/2,a+ww/2)]))
        for left,right in zip(edges,edges[1:]):
            middle=(left+right)/2;opening=next((p for p in openings if abs(middle-p[0])<p[1]/2),None)
            spans=[(0,h)] if not opening else [(0,opening[2]),(opening[3],h)]
            for low,high in spans:
                if high<=low:continue
                # Keep the supporting wall behind its relief instead of coplanar with it.
                b('mortar' if biome=='sunveil' else 'jungleplaster',middle,(low+high)/2,0,right-left,high-low,.22)
                rows=math.ceil((high-low)/(.54 if biome=='sunveil' else .78));rise=(high-low)/rows
                for row in range(rows):
                    cursor=left;column=0
                    while cursor<right-.01:
                        width=min(right-cursor,([.75,1.17,.94,1.32] if biome=='sunveil' else [1.15,1.5,1.25,1.8])[(row+column)%4])
                        col=['sand','sandlight','sand','sanddark','sand'][(row*3+column)%5] if biome=='sunveil' else 'jungleplaster'
                        b(col,cursor+width/2,low+(row+.5)*rise,.124+(row%3)*.007,max(.02,width-.027),rise-.027,.070)
                        cursor+=width;column+=1
        if biome=='mistwood':
            for dx in [-length/2+.105,length/2-.105]:
                b('oakdark',dx,h/2,0,.21,h,.35)
                for yy in [.48,1.20,h-.50]:
                    b('bamboo',dx,yy,.148,.16,.12,.045)
                    b('jade',dx,yy+.18,.151,.115,.115,.041)
            for yy in [.24,h-.27]:
                if door and yy<1:
                    for side in [-1,1]:b('oak',side*(length/4+.72),yy,.12,length/2-1.44,.22,.1)
                else:b('oak',0,yy,.12,length,.22,.1)
            for dx in [-length*.14,length*.14]:
                b('oak',dx,h-.98,.12,.16,1.5,.1)
                for i in range(4):b('bamboo',dx+(i-1.5)*.10,h-.8+abs(i-1.5)*.11,.155,.10,.12,.03)
        else:
            for yy in [.2,h-.32]:
                if door and yy<1:
                    for side in [-1,1]:b('sandlight',side*(length/4+.72),yy,.135,length/2-1.44,.26,.07)
                else:b('sandlight',0,yy,.135,length,.26,.07)
            for i in range(int(length/.5)):
                xx=-length/2+(i+.5)*length/int(length/.5)
                b('teal',xx,h-.32,.173,.18,.09,.008)
        for a,ww,low,high in openings:
            if low==0:
                for side in [-1,1]:b('chalk' if biome=='sunveil' else 'oaklight',side*(ww/2+.07),1.8,.03,.14,3.6,.29)
                b('sandlight' if biome=='sunveil' else 'oaklight',0,3.74,.02,ww+.30,.28,.30)
                for dx in [-.8,0,.8]:b('teal' if biome=='sunveil' else 'jade',dx,3.74,.175,.23,.12,.012)
                continue
            yy=(low+high)/2
            b('glass',a,yy,-.08,ww,high-low,.025)
            for side in [-1,1]:b('chalk' if biome=='sunveil' else 'oaklight',a+side*(ww/2+.05),yy,.035,.1,high-low+.20,.27)
            for hh in [low-.065,high+.065]:b('sandlight' if biome=='sunveil' else 'bamboo',a,hh,.035,ww+.2,.13,.27)
            for dx in [-.46,0,.46]:b('teal' if biome=='sunveil' else 'bamboo',a+dx,yy,.025,.065,high-low,.10)
            for hh in [low+.50,low+1.13]:b('teallight' if biome=='sunveil' else 'oaklight',a,hh,.035,ww,.07,.13)
    wing=(w-2.8)/2
    m.solids=[[-w/2,0,.35,d+.35],[w/2,0,.35,d+.35],[0,-d/2,w,.35],[-(2.8+wing)/2,d/2,wing,.35],[(2.8+wing)/2,d/2,wing,.35]]

def desert_roof(m,w,d,h,inn):
    m.part('roof-shingles');b=m.box
    b('sanddark',0,h+.10,0,w+.50,.20,d+.50)
    b('sandlight',0,h+.27,0,w+.75,.15,d+.75)
    b('sand',0,h+.43,0,w+.28,.17,d+.28)
    for side in [-1,1]:
        b('chalk',side*(w/2-.12),h+.73,0,.34,.55,d+.25)
        b('chalk',0,h+.73,side*(d/2-.12),w-.5,.55,.34)
    for x in range(math.ceil(w)):
        for side in [-1,1]:b('sandlight',-w/2+(x+.5)*w/math.ceil(w),h+1.1,side*(d/2-.12),.44,.24,.42)
    for z in range(math.ceil(d)-1):
        for side in [-1,1]:b('sandlight',side*(w/2-.12),h+1.1,-d/2+(z+1)*d/math.ceil(d),.42,.24,.44)
    # A stepped central copper dome gives inns a landmark silhouette; small homes have a shaded roof pavilion.
    radius=3.0 if inn else 1.85;levels=10 if inn else 7
    for i in range(levels):
        t=i/levels;size=radius*2*math.sqrt(1-t*t);rise=.24
        b('copperlight' if i%3==0 else 'copper',0,h+.65+i*rise,-.6,size,rise+.015,size)
    b('teal',0,h+.65+levels*.24,-.6,.37,.46,.37)
    b('gold',0,h+1.06+levels*.24,-.6,.18,.36,.18)
    for x in [-w*.32,w*.32]:
        b('sandlight',x,h+.79,-d*.26,.92,.65,.82)
        b('tealdark',x,h+.89,-d*.26+.418,.51,.20,.018)
        b('chalk',x,h+1.15,-d*.26,1.06,.14,.95)
    # Suspended shade starts well above the 3.6m door; no new ground posts.
    for i in range(8):b('teal' if i%2 else 'linen',-.0,4.18+i*.025,d/2+.34+(i+.5)*.10,3.55,.10,.10)

def jungle_roof(m,w,d,h,inn):
    m.part('roof-shingles');b=m.box
    layers=16 if inn else 13;rise=4.4 if inn else 3.4;span=w+1.15;depth=d+1.25
    for side in [-1,1]:b('oakdark',side*(w/2-.15),h+.02,0,.45,.28,depth)
    columns=math.ceil(depth/.8);cell=depth/columns
    for i in range(layers):
        half=span/2*(1-(i+.5)/layers);step=span/(2*layers)
        y=h+.16+i*rise/layers
        for side in [-1,1]:
            for j in range(columns):
                z=-depth/2+(j+.5)*cell
                b(['leaf','leafdark','leaf','leaflight'][(i+j*3)%4],side*half,y,z,step+.10,rise/layers+.035,cell)
            for z in [-depth/2-.035,depth/2+.035]:b('oaklight',side*half,y-.12,z,step+.11,.18,.09)
    b('bamboo',0,h+rise+.14,0,.35,.24,depth+.17)
    for zside in [-1,1]:
        z=zside*(depth/2+.08)
        for i in range(4):b('oak',0,h+rise+.3+i*.19,z+zside*i*.08,.24,.23,.28)
        b('jade',0,h+rise+.99,z+zside*.28,.42,.21,.22)
        # Upper triangular gables avoid showing the removed original cream gables.
        for i in range(layers):
            width=w*(1-(i+.5)/layers)
            b('oak' if i%3 else 'oaklight',0,h+(i+.5)*rise/layers,zside*d/2,width,rise/layers,.28)
            b('bamboo',0,h+(i+.5)*rise/layers,zside*(d/2+.19),.16,rise/layers+.025,.14)
            for side in [-1,1]:b('oaklight',side*max(.10,width/2-.24),h+(i+.5)*rise/layers,zside*(d/2+.20),.36,.15,.15)
        for side in [-1,1]:
            for i in range(7):
                x=side*(w*.42-i*.13);y=h-.12-i*.15
                b('moss',x,y,zside*(d/2+.10),.13,.28,.12)
                if i%2==0:m.leaf('leaflight',(x,y,zside*(d/2+.1)),(x+side*.32,y-.16,zside*(d/2+.2)),.32)
    for x in [-w*.37,w*.37]:
        b('oakdark',x,h+.42,-d*.24,.70,.85,.67)
        b('tealdark',x,h+.64,-d*.24+.344,.41,.21,.018)
        b('leafdark',x,h+.89,-d*.24,.95,.14,.93)

for biome in ['sunveil','mistwood']:
    for kind,w,d,h in [('cottage',10,9,5.2),('inn',14,12,5.5)]:
        m=Model(biome+'-'+kind,[w,d]);walls(m,biome,w,d,h)
        if biome=='sunveil':desert_roof(m,w,d,h,kind=='inn')
        else:jungle_roof(m,w,d,h,kind=='inn')
        m.finish('exterior')

def recolor(m,changes):
    replace={PALETTE[old]:PALETTE[new] for old,new in changes.items()}
    for part in m.parts.values():part['colors']=[replace.get(col,col) for col in part['colors']]

OLD_STYLE={
    'greenwood':{'jungleplaster':'linen','bamboo':'oaklight','jade':'moss'},
    'amberwild':{'sand':'sandlight','sandlight':'chalk','sanddark':'sand','teal':'autumn','teallight':'gold','tealdark':'autumndark'},
    'frostmarch':{'jungleplaster':'slate','oak':'frostwood','oaklight':'frostlight','oakdark':'slatedark','bamboo':'snowshade','jade':'blue'},
    'hollow':{'jungleplaster':'rootstone','oak':'rootdark','oaklight':'rootlight','oakdark':'rootdark','bamboo':'violetlight','jade':'violet'},
}

def old_roof(m,biome,w,d,h,inn):
    """Four original roof constructions, with continuous steps and no low overhang solids."""
    m.part('roof-shingles');b=m.box
    top={'greenwood':3.2,'amberwild':3.5,'frostmarch':4.0,'hollow':3.8}[biome]+(.65 if inn else 0)
    tint,light={'greenwood':('moss','leaflight'),'amberwild':('autumn','autumnlight'),
        'frostmarch':('slate','snow'),'hollow':('violet','violetlight')}[biome]
    tiers=14 if inn else 12;span=w+.9;depth=d+.9
    for i in range(tiers):
        half=span/2*(1-(i+.5)/tiers);step=span/(2*tiers);yy=h+.16+i*top/tiers
        for side in [-1,1]:
            b(tint,side*half,yy,0,step+.08,top/tiers+.04,depth)
            if biome=='frostmarch':
                b('snow',side*half,yy+top/tiers/2+.055,0,step+.10,.10,depth+.07)
            else:
                # Raised rows break up long surfaces without coplanar overlap.
                for zz in [-depth*.34,0,depth*.34]:b(light,side*half,yy+top/tiers/2+.025,zz,step+.04,.05,.25)
            for zz in [-depth/2,depth/2]:b('oaklight' if biome in ['greenwood','amberwild'] else 'frostwood' if biome=='frostmarch' else 'rootdark',side*half,yy-.16,zz,step+.10,.18,.14)
        for zz in [-d/2,d/2]:
            b('plank' if biome in ['greenwood','amberwild'] else 'slatedark' if biome=='frostmarch' else 'rootstone',0,h+(i+.5)*top/tiers,zz,w*(1-(i+.5)/tiers),top/tiers,.28)
            timber='oaklight' if biome in ['greenwood','amberwild'] else 'frostlight' if biome=='frostmarch' else 'rootlight'
            front=zz+math.copysign(.20,zz)
            b(timber,0,h+(i+.5)*top/tiers,front,.18,top/tiers+.025,.15)
            for side in [-1,1]:b(timber,side*max(.10,w*(1-(i+.5)/tiers)/2-.24),h+(i+.5)*top/tiers,front,.38,.16,.17)
    b(light,0,h+top+.21,0,.45,.22,depth+.2)
    if biome=='greenwood':
        # A small timber dormer and clusters of rooted roof moss.
        dormer_y=h+top*.54+.85  # The glazing sits above the pitched roof, not inside it.
        for side in [-1,1]:b('oakdark',w*.23+side*.64,dormer_y,d*.12,.22,1.30,1.45)
        for yy in [dormer_y-.56,dormer_y+.56]:b('oakdark',w*.23,yy,d*.12,1.5,.18,1.45)
        b('glass',w*.23,dormer_y,d*.12+.68,.85,.83,.025)
        b('oaklight',w*.23,dormer_y,d*.12+.78,.11,.92,.07)
        for side in [-1,1]:b('moss',w*.23+side*.45,dormer_y+.72,d*.12,1.00,.20,1.68)
        for i in range(10):b('leaflight' if i%3==0 else 'moss',-w*.33+(i%4)*.28,h+.4+(i%4)*.17,-d*.32+(i//4)*.3,.35,.20,.38)
    elif biome=='amberwild':
        # Twin terracotta chimney stacks and an autumn sun above the entrance.
        for side in [-1,1]:
            x=side*w*.30
            b('terracotta',x,h+1.85,-d*.25,.83,2.9,.79)
            b('autumndark',x,h+3.33,-d*.25,1.07,.19,1.01)
            b('sandlight',x,h+3.5,-d*.25,1.19,.16,1.13)
        for x,y in [(0,0),(-.4,0),(.4,0),(0,-.4),(0,.4)]:b('gold',x,h+1.7+y,d/2+.18,.22 if x or y else .44,.22 if x or y else .44,.10)
    elif biome=='frostmarch':
        b('slatedark',-w*.3,h+2.2,-d*.26,.88,3.6,.85)
        b('snow',-w*.3,h+4.07,-d*.26,1.15,.20,1.1)
        # Ice hangs above head height, well clear of entry ramps.
        for side in [-1,1]:
            for i in range(9):b('snowshade',side*(w/2+.34),h-.05-(i%3)*.09,-d/2+(i+.5)*d/9,.10,.35+(i%3)*.18,.11)
    else:
        # Twisting ridge roots and violet shard finials identify Hollow refuges.
        for side in [-1,1]:
            for i in range(6):
                y=h+top+.26+i*.21;z=side*(d/2+.22-i*.09)
                b('rootdark',side*.13*math.sin(i),y,z,.29,.28,.28)
            b('violetlight',0,h+top+1.60,side*(d/2-.22),.37,.66,.32)
        for side in [-1,1]:
            for i in range(8):b('rootdark',side*(w*.43-i*.23),h+.4+i*.29,side*(d/2+.04),.50,.35,.39)

for biome in OLD_STYLE:
    for kind,w,d,h in [('cottage',10,9,5.2),('inn',14,12,5.5)]:
        m=Model(biome+'-'+kind,[w,d]);walls(m,'sunveil' if biome=='amberwild' else 'mistwood',w,d,h)
        recolor(m,OLD_STYLE[biome]);old_roof(m,biome,w,d,h,kind=='inn');m.finish('exterior')

for biome in ['sunveil','mistwood',*OLD_STYLE]:
    m=Model(biome+'-market',[3,2]);b=m.box
    for x in [-1.34,1.34]:
        for z in [-.85,.85]:
            b('oaklight' if biome=='sunveil' else 'bamboo',x,1.55,z,.16,3.1,.16)
            b('teal' if biome=='sunveil' else 'jade',x,2.64,z,.18,.12,.18)
    for i in range(12):
        x=-1.5+(i+.5)*3/12;y=3.02+.3*(1-abs(x)/1.5)
        b(('linen' if i%2 else 'teal') if biome=='sunveil' else ('leaflight' if i%3==0 else 'leaf'),x,y,0,.25,.12,2)
        b('gold' if biome=='sunveil' else 'bamboo',x,y-.13,1,.17,.20,.07)
    for side in [-1,1]:b('oak',side*1.15,.43,-.54,.16,.86,.55)
    b('plank',0,.93,-.54,2.7,.16,.75)
    for i in range(5):
        b('fruit' if biome=='sunveil' else 'flower',-.99+i*.48,1.10,-.55,.30,.24,.31)
        b('leaf' if biome=='sunveil' else 'lime',-.98+i*.48,1.25,-.55,.18,.09,.13)
    m.solids=[[-1.34,-.85,.16,.16],[-1.34,.85,.16,.16],[1.34,-.85,.16,.16],[1.34,.85,.16,.16],[0,-.54,2.7,.75]]
    if biome in OLD_STYLE:
        recolor(m,{'leaf':'moss','leaflight':'leaflight','bamboo':'oaklight'} if biome=='greenwood' else
            {'leaf':'autumn','leaflight':'autumnlight','bamboo':'oaklight','jade':'gold'} if biome=='amberwild' else
            {'leaf':'snow','leaflight':'snowshade','bamboo':'frostwood','jade':'blue'} if biome=='frostmarch' else
            {'leaf':'violet','leaflight':'violetlight','bamboo':'rootdark','jade':'violetlight'})
    m.finish()

# A dedicated Hollow gateway: a six-by-six metre clear passage and no threshold.
m=Model('hollow-gate',[10,6]);b=m.box
for side,name in [(-1,'left'),(1,'right')]:
    m.part('shell-'+name);x=side*4
    b('rootdark',x,5,0,2,10,5.80)
    for row in range(16):
        for col in range(2):
            for front in [-1,1]:
                b('rootstone' if (row+col)%3 else 'rootlight',x+(col-.5)*.95,(row+.5)*.6,front*2.95,.90,.56,.08)
        if row%4==0:b('violet',x,(row+.5)*.6,2.98,1.42,.11,.04)
    for yy in [.20,5.75,9.85]:b('rootlight',x,yy,0,2,.35,6)
    for i in range(10):
        xx=x+side*.43*math.sin(i*.38);y=.5+i*.88
        b('oakdark',xx,y,2.89,.37,.99,.20)
        if i%3==0:b('moss',xx+.17,y+.28,2.955,.25,.18,.08)
    m.solids.append([x,0,2,6])
m.part('roof-shingles')
b('rootdark',0,8.1,0,6,4.2,6)
for i in range(4):
    for side in [-1,1]:b('rootlight',side*(2.72-i*.34),6.22+i*.4,3.035,.65,.40,.19)
for row in range(4):
    for col in range(6):b('rootstone' if (row+col)%3 else 'rootlight',(col-2.5)*.97,8.1+row*.49,3.02,.93,.45,.12)
for side in [-1,1]:
    for i in range(9):b('oakdark',side*(4.1-i*.45),10.3+math.sin(i*.2)*.65,.8,.62,.55,3.4)
for i,w in enumerate([.42,.9,1.3,1.5,1.15,.65,.24]):b('violetlight' if i%3==0 else 'violet',0,8.36+i*.26,3.18,w,.29,.26)
b('rootdark',0,11.35,0,3.7,.45,3.9);b('violetlight',0,11.82,0,.48,.36,.50)
m.finish('gateway')

m=Model('sunveil-palm',[1.1,1.1]);b=m.box
for i in range(22):
    y=(i+.5)*.52;x=.30*math.sin(i*.13)
    b('oaklight' if i%3==0 else 'oak',x,y,0,.79-i*.012,.52,.77-i*.011)
    if i%2==0:b('bamboo',x,y+.17,0,.81-i*.012,.09,.80-i*.011)
for branch in range(9):
    a=branch*math.tau/9
    for i in range(6):
        t=i/5;r=.2+t*5.6;y=11.4+math.sin(t*math.pi)*1.0-t*1.1
        nxt=.2+(t+.19)*5.6;yy=11.4+math.sin(min(1,t+.19)*math.pi)*1-min(1,t+.19)*1.1
        m.beam('leafdark',(math.cos(a)*r,y,math.sin(a)*r),(math.cos(a)*nxt,yy,math.sin(a)*nxt),.18)
        m.leaf('leaf' if branch%3 else 'leaflight',(math.cos(a)*r,y+.035,math.sin(a)*r),
            (math.cos(a)*nxt,yy+.035,math.sin(a)*nxt),1.05*(1-t*.65))
        for side in [-1,1]:
            start=(math.cos(a)*r,y,math.sin(a)*r)
            end=(math.cos(a)*r+math.cos(a+side*1.25)*1.18*(1-t*.5),y-.35,math.sin(a)*r+math.sin(a+side*1.25)*1.18*(1-t*.5))
            m.leaf('leaflight' if (branch+i)%4==0 else 'leaf',start,end,.42*(1-t*.55))
for x,z in [(-.36,.1),(.22,.27),(.16,-.31)]:b('fruit',x,10.97,z,.52,.59,.49)
m.solids=[[0,0,1.1,1.1]];m.finish()

m=Model('sunveil-cactus',[3.2,1]);b=m.box
b('cactus',0,2.55,0,.82,5.1,.75);b('cactuslight',-.27,2.48,.35,.12,4.85,.10)
for side,y,h in [(-1,2.25,1.35),(1,3.1,1.2)]:
    b('cactus',side*.88,y,0,1.05,.65,.61);b('cactusdark',side*1.29,y+h/2,0,.64,h,.59)
    b('cactuslight',side*1.29-.18,y+h/2,.27,.10,h-.16,.06)
for y in [.5,1.4,2.3,3.5,4.4]:
    for side in [-1,1]:b('spine',side*.25,y,.398,.05,.11,.04)
b('flower',.03,5.15,0,.36,.21,.31);b('gold',.03,5.27,0,.13,.07,.13)
m.solids=[[0,0,.9,.85],[-1.29,0,.67,.65],[1.29,0,.67,.65]];m.finish()

m=Model('sunveil-rock',[4.5,3.5]);b=m.box
for x,y,z,w,h,d,col in [(-.4,.60,0,3.7,1.2,2.8,'rockdark'),(-.65,1.5,-.12,2.7,.60,2.4,'rock'),(-.84,1.95,-.16,1.9,.3,1.9,'rocklight'),(1.2,.35,.69,1.4,.7,1.2,'rock')]:b(col,x,y,z,w,h,d)
for i in range(5):b('sand',-1.25+i*.53,1.3,-1.36,.33,.07,.07)
m.solids=[[0,0,4.5,3.5]];m.finish()

m=Model('mistwood-broadleaf',[3.4,3.4]);b=m.box
for i in range(21):b('oakdark' if i%4==0 else 'oak',math.sin(i*.2)*.21,(i+.5)*.57,0,1.55-i*.029,.57,1.47-i*.03)
for a in [0,1.6,3.1,4.7]:
    for i in range(4):
        r=.48+i*.28;b('oakdark',math.cos(a)*r,.75-i*.17,math.sin(a)*r,.67,1.5-i*.34,.65)
random.seed(35)
for i,(x,y,z,r) in enumerate([(-3,11,-2,2.8),(3.1,11.7,-1.6,3.1),(-1,14,2,3.2),(2,14.8,1.8,3.0),(0,16.0,-1.1,2.6)]):
    m.beam('oak',(0,8.7,0),(x,y-.5,z),.59)
    for layer,size in [(-.75,.79),(0,1),(.66,.77)]:
        for ix in range(5):
            for iz in range(5):
                xx=(ix-2)*r*.40;zz=(iz-2)*r*.40
                if abs(ix-2)+abs(iz-2)>3:continue
                tint=['leafdark','leaf','leaf','leaflight','lime'][(ix*5+iz+i+int(layer*10))%5]
                b(tint,x+xx*size,y+layer,z+zz*size,r*.405*size,.70,r*.405*size)
    if i<3:
        for step in range(9):
            xx=x+.65+math.sin(step*.56)*.13;yy=y-.5-step*.42;zz=z+.7
            b('moss',xx,yy,zz,.12,.44,.12)
            if step%2==0:m.leaf('fern',(xx,yy,zz),(xx+.42,yy-.22,zz+.1),.32)
m.solids=[[0,0,3.4,3.4]];m.finish()

m=Model('mistwood-fern',[.7,.7]);b=m.box
for j in range(9):
    a=j*math.tau/9
    for i in range(7):
        t=i/7;r=.1+t*2.6;y=.35+math.sin(t*math.pi)*1.25+t*.25
        rr=.1+(t+1/7)*2.6;yy=.35+math.sin((t+1/7)*math.pi)*1.25+(t+1/7)*.25
        m.beam('moss',(math.cos(a)*r,y,math.sin(a)*r),(math.cos(a)*rr,yy,math.sin(a)*rr),.07)
        m.leaf('fern',(math.cos(a)*r,y+.025,math.sin(a)*r),(math.cos(a)*rr,yy+.025,math.sin(a)*rr),.56*(1-t*.65))
        for side in [-1,1]:
            length=.82*(1-t*.70)
            m.leaf('ferntip' if i>4 else 'fern',(math.cos(a)*r,y,math.sin(a)*r),
                (math.cos(a)*r+math.cos(a+side*1.2)*length,y+.07,math.sin(a)*r+math.sin(a+side*1.2)*length),.43*(1-t*.6))
for i in range(4):b('moss',0,.15+i*.20,0,.30-i*.04,.2,.30-i*.04)
m.finish()

m=Model('mistwood-root',[4.4,2.8]);b=m.box
for i in range(9):
    t=i/8;x=-1.8+t*3.6;y=.24+math.sin(t*math.pi)*1.5
    b('oakdark' if i%3==0 else 'oak',x,y,.25*math.sin(t*math.tau),.57,.46,.64)
    if i%2==0:b('moss',x,y+.26,.25*math.sin(t*math.tau),.51,.12,.51)
for side in [-1,1]:
    for i in range(4):b('oak',side*(1.5+i*.12),.18-i*.02,-i*.34,.51,.36-i*.04,.50)
for x,z in [(-1.5,.65),(1.25,-.60)]:
    b('linen',x,.25,z,.10,.50,.10);b('flower',x,.52,z,.42,.15,.4);b('gold',x-.10,.61,z-.08,.12,.035,.12)
m.solids=[[0,0,4.4,2.8]];m.finish()

for directory in [EXPORT.parent,SOURCE.parent]:directory.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,
    export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
cli=['npx','--yes','@gltf-transform/cli@4.5.0']
with tempfile.TemporaryDirectory(prefix='mossvale-frontier-') as tmp:
    a,b,c=[str(Path(tmp)/f'{i}.glb') for i in range(3)]
    for args in [['weld',str(EXPORT),a],['quantize',a,b,'--pattern','{POSITION,NORMAL,COLOR_*}','--quantize-position','16','--quantize-normal','8','--quantize-color','8'],['dedup',b,c],['prune',c,str(EXPORT)]]:
        subprocess.run(cli+args,check=True)

# Editable art-direction gallery. Ground and lights are excluded from the shipped library.
gallery=bpy.data.scenes.new('Sunveil and Mistwood field study');bpy.context.window.scene=gallery
places={
    'sunveil-cottage':(-22,0,12),'sunveil-inn':(-22,0,-9),'sunveil-market':(-12,0,13),
    'sunveil-palm':(-34,0,0),'sunveil-cactus':(-12,0,-3),'sunveil-rock':(-31,0,20),
    'mistwood-cottage':(17,0,12),'mistwood-inn':(17,0,-9),'mistwood-market':(6,0,14),
    'mistwood-broadleaf':(32,0,-1),'mistwood-fern':(26,0,20),'mistwood-root':(2,0,8),
    **{f'{biome}-{kind}':(-30+index*20,0,-38-(18 if kind=='inn' else 0)) for index,biome in enumerate(OLD_STYLE) for kind in ['cottage','inn']},
    **{f'{biome}-market':(-23+index*20,0,-30) for index,biome in enumerate(OLD_STYLE)},
    'hollow-gate':(48,0,-42),
}
for root in roots:
    parent=root.copy();gallery.collection.objects.link(parent);parent.location=xyz(*places[root.name.removeprefix('frontier-')])
    for child in root.children:
        obj=child.copy();obj.data=child.data;gallery.collection.objects.link(obj);obj.parent=parent
def ground(name,colour,x):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(x,-.16,1));obj=bpy.context.object;obj.name=name;obj.scale=(39,48,.28)
    mat=bpy.data.materials.new(name);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=PALETTE[colour];obj.data.materials.append(mat)
ground('Sunveil gallery sand','sand',-19.6);ground('Mistwood gallery moss','leafdark',19.6)
def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(76,77,100));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=132;aim(camera,(4,3,-20));gallery.camera=camera
for at,power,size in [((-35,45,32),12000,25),((30,25,-10),6000,20)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*at));light=bpy.context.object;light.data.energy=power;light.data.size=size;aim(light,(0,2,0))
bpy.ops.object.light_add(type='SUN',location=xyz(-20,30,12));sun=bpy.context.object;sun.data.energy=2.1;sun.data.angle=.20;aim(sun,(0,0,0))
gallery.world=bpy.data.worlds.new('Frontier daylight');gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.20,.25,.28,1);gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
gallery.render.engine='CYCLES';gallery.cycles.samples=32;gallery.cycles.use_denoising=True
gallery.render.resolution_x=2000;gallery.render.resolution_y=1250;gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG';gallery.render.filepath=str(PREVIEW);gallery.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('FRONTIER_ASSETS '+json.dumps({'models':stats,'bytes':EXPORT.stat().st_size}))
if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
