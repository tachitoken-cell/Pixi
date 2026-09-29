"""Blender-authored walkable Mossvale houses. Metres, Y up, +Z front after export.

Blender --background --python scripts/build-house-assets.py -- --render --optimize
Separate exterior faces/roof support runtime cutaways; chair pivots sit at floor level.
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
EXPORT = ROOT / 'public/models/house-interiors.glb'
SOURCE = ROOT / 'assets/source/house-interiors.blend'
PREVIEW = ROOT / 'assets/source/house-interiors-preview.png'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
library = bpy.context.scene
library.name = 'Walkable house library'
library.unit_settings.system = 'METRIC'

def xyz(x, y, z): return x, -z, y
def linear(v): return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
PALETTE = {name: tuple(linear(int(value[i:i+2], 16) / 255) for i in (0, 2, 4)) + (1,)
           for name, value in {
    'oak': '795338', 'oaklight': 'B08252', 'oakdark': '493729', 'plank': '9C7249',
    'planklight': 'AE8355', 'plankdark': '8F6542', 'cream': 'E1CCA0', 'plaster': 'C8B289',
    'stone': '8B8D7C', 'stonebright': 'B0AA92', 'stoneshade': '5C6962', 'iron': '354746',
    'teal': '36746A', 'rooflight': '568F77', 'roofdark': '28534E', 'blue': '6DA9AD',
    'gold': 'DFB35F', 'amber': 'F4D38B', 'cloth': '447E75', 'clothlight': '75A896',
    'wine': '9C4F54', 'red': 'C56B57', 'linen': 'E4DBC0', 'shadow': '302F2B',
    'ember': 'C66E39', 'fire': 'F2B455', 'leaf': '648647', 'leaflight': '93B562',
}.items()}
material = bpy.data.materials.new('House vertex palette')
material.use_nodes = True
shader = material.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .86
color = material.node_tree.nodes.new('ShaderNodeVertexColor')
color.layer_name = 'HouseTint'
material.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
# Alpha glazing keeps the furnished room visible without a transmission render pass.
glass = material.copy(); glass.name = 'House clear window glass'
glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = .20
glass.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .18
glass.surface_render_method = 'DITHERED'
roots, stats = [], {}

class House:
    def __init__(self, name, width, depth, height, city=False):
        self.name, self.width, self.depth, self.height = name, width, depth, height
        self.city, self.basekind = city, name.removeprefix('city-')
        self.eaves = (7.5 if self.basekind == 'inn' else 5.5) if city else height
        self.rise = (4.25 if self.basekind == 'inn' else 3.65) if city else (3.7 if self.basekind == 'inn' else 2.9)
        self.parts, self.current, self.cubes = {}, None, 0

    def part(self, name, pivot=(0, 0, 0), rotation=0):
        self.current_name = name
        self.current = self.parts.setdefault(name, {
            'vertices': [], 'faces': [], 'colors': [], 'boxes': [], 'pivot': pivot, 'rotation': rotation,
        })

    def box(self, tint, x, y, z, w, h, d, turn=0):
        if tint == 'glass':
            name = self.current_name
            self.part(name+'-glass')
            self.box('blue', x, y, z, w, h, d, turn)
            self.part(name)
            return
        part = self.current
        start = len(part['vertices'])
        c, s = math.cos(turn), math.sin(turn)
        for a, b, f in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                        (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
            xx, yy, zz = a*w/2, b*h/2, f*d/2
            part['vertices'].append(xyz(x+xx*c+zz*s, y+yy, z-xx*s+zz*c))
        for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]:
            part['faces'].append(tuple(start+n for n in face))
            part['colors'].append(PALETTE[tint])
        vertices=part['vertices'][start:]
        if abs(math.sin(turn*2))<1e-8:
            part['boxes'].append((tuple(min(v[a] for v in vertices) for a in range(3)),tuple(max(v[a] for v in vertices) for a in range(3)),len(part['faces'])-6))
        self.cubes += 1

    def panel(self, b, length, low, high, openings, depth=.35):
        """Build a thick wall around real apertures, including every upper storey."""
        xs = sorted(set([-length/2, length/2]+[max(-length/2,min(length/2,v)) for a,w,_,_ in openings for v in [a-w/2,a+w/2]]))
        ys = sorted(set([low,high]+[max(low,min(high,v)) for _,_,lo,hi in openings for v in [lo,hi]]))
        for left,right in zip(xs,xs[1:]):
            for bottom,top in zip(ys,ys[1:]):
                xx,yy=(left+right)/2,(bottom+top)/2
                if any(abs(xx-a)<w/2 and lo<yy<hi for a,w,lo,hi in openings):continue
                b('cream',xx,yy,0,right-left,top-bottom,depth)
                rows=math.ceil((top-bottom)/.78)
                for row in range(rows):
                    height=(top-bottom)/rows
                    columns=math.ceil((right-left)/1.65)
                    for col in range(columns):
                        width=(right-left)/columns
                        b('plaster' if (col+row)%4==0 else 'cream',left+(col+.5)*width,bottom+(row+.5)*height,depth/2+.015+(row%2)*.012,width-.025,height-.023,.07)

    def wall(self, name, length, x, z, turn, door=False):
        self.part('shell-'+name)
        c, s = math.cos(turn), math.sin(turn)
        h = self.height
        def b(tint, dx, y, dz, w, hh, d):
            self.box(tint, x+dx*c+dz*s, y, z-dx*s+dz*c, w, hh, d, turn)
        # Partition the actual wall around door and window holes, never fill the room.
        openings = [(-length*.30, 1.45, 1.9, 3.65), (length*.30, 1.45, 1.9, 3.65)]
        if door: openings.append((0, 2.8, 0, 3.6))
        self.panel(b,length,0,h,openings)
        for side in [-1,1]:
            b('oakdark', side*(length/2-.10), h/2, 0, .29, h+.10, .42)
            b('oaklight', side*(length/2-.105), h/2, .24, .13, h-.15, .04)
        for yy in [.16, h-.18]:
            if door and yy < 1:
                for side in [-1,1]: b('oak', side*(length/4+.73), yy, .205, length/2-1.46, .25, .18)
            else: b('oak', 0, yy, .205, length+.20, .25, .18)
        # Header band, plaster patches and visible structural pegs.
        for side in [-1,1]:
            b('plaster', side*length*.20, h-.53, .186, length*.14, .18, .025)
            for yy in [.44, h-.41]: b('iron', side*(length/2-.10), yy, .235, .075, .075, .025)
        for a, w, low, high in openings:
            if low == 0:
                for side in [-1,1]: b('oaklight', side*(w/2+.11), 1.82, .06, .19, 3.64, .49)
                b('oakdark', 0, 3.73, .04, w+.50, .26, .53)
                b('oaklight', 0, 3.77, .325, w+.61, .095, .05)
                # Thin threshold stays below floor height and never obstructs entry.
                b('stonebright', 0, -.055, .25, w, .10, .90)
                continue
            middle = (low+high)/2
            # Windows are framed apertures with recessed blue panes.
            b('glass', a, middle, -.10, w-.04, high-low-.04, .025)
            for side in [-1,1]: b('oak', a+side*(w/2+.05), middle, .065, .12, high-low+.20, .42)
            for yy in [low-.04, high+.04]: b('oaklight', a, yy, .065, w+.25, .13, .43)
            # The upright projects on both sides of the darker crossing rail.
            b('oaklight', a, middle, .11, .095, high-low, .17)
            b('oak', a, middle+.13, .11, w, .085, .12)
            b('stonebright', a, low-.16, .21, w+.42, .19, .63)
            for side in [-1,1]:
                b('teal', a+side*(w/2+.30), middle, .20, .36, high-low+.14, .16)
                for i in range(6): b('rooflight', a+side*(w/2+.30), low+.12+i*.28, .293, .29, .035, .035)
                for yy in [low+.17, high-.17]: b('iron', a+side*(w/2+.30), yy, .321, .34, .06, .025)
        if door:
            for side in [-1,1]:
                xx = side*1.89
                b('oakdark', xx, 2.62, .29, .15, .61, .18)
                b('amber', xx, 2.56, .48, .23, .39, .23)
                for yy in [2.30,2.81]: b('iron', xx, yy, .48, .38, .10, .36)
                for dx in [-.14,.14]: b('iron', xx+dx, 2.55, .50, .035, .48, .29)
        if self.city:
            self.city_facade(name, length, b, door)
        if name in ['front', 'back']:
            if self.city: self.part('roof-gable-'+name)
            tiers = (17 if self.basekind == 'inn' else 15) if self.city else (12 if self.basekind == 'inn' else 10)
            rise = self.rise
            gable_base = self.eaves
            for i in range(tiers):
                w = length*(1-i/tiers)
                attic=[(side*length*.24,.60,gable_base+.255,gable_base+1.385) for side in [-1,1]] if self.city else []
                self.panel(b,w,gable_base+i*rise/tiers,gable_base+(i+1)*rise/tiers,attic,.28)
                b('oak', 0, gable_base+(i+.5)*rise/tiers, .19, .20, rise/tiers+.025, .15)
            # Half-timbered gable braces remain rectangular steps in the voxel style.
            for side in [-1,1]:
                for i in range(tiers):
                    brace_x,brace_y=side*length*.43*(1-i/tiers),gable_base+i*rise/tiers
                    if any(abs(brace_x-a)<(length*.12+ww)/2 and brace_y+.09>low and brace_y-.09<high for a,ww,low,high in attic):continue
                    b('oaklight', side*length*.43*(1-i/tiers), gable_base+i*rise/tiers,
                      .20, length*.12, .18, .16)
            if self.city:
                # Tall attic windows and a carved sun keep the enlarged gable inhabited.
                for side in [-1, 1]:
                    xx = side*length*.24
                    for dx in [-.365,.365]:b('oakdark',xx+dx,gable_base+.82,.14,.13,1.38,.38)
                    for yy in [gable_base+.19,gable_base+1.45]:b('oakdark',xx,yy,.14,.85,.12,.38)
                    b('glass', xx, gable_base+.82, .02, .60, 1.13, .025)
                    b('oaklight', xx, gable_base+.82, .34, .08, 1.18, .08)
                    b('oaklight', xx, gable_base+.80, .34, .67, .09, .08)
                    b('stonebright', xx, gable_base+.11, .27, 1.02, .13, .44)
                b('oakdark', 0, gable_base+2.35, .22, .71, .71, .16)
                for xx, yy, size in [(0,0,.34),(-.31,0,.12),(.31,0,.12),(0,-.31,.12),(0,.31,.12)]:
                    b('gold', xx, gable_base+2.35+yy, .325, size, size, .06)

    def city_facade(self, name, length, b, door):
        # All ground-floor details share their wall's cutaway part and leave the doorway open.
        columns = math.ceil(length/.91)
        for row in range(3):
            for i in range(columns):
                left = -length/2 + i*length/columns
                right = left + length/columns
                spans = [(left, right)] if not door else [(left, min(right,-1.43)), (max(left,1.43), right)]
                for lo, hi in spans:
                    if hi-lo > .04:
                        b(['stone', 'stonebright', 'stoneshade'][(i+row*2)%3], (lo+hi)/2, .25+row*.37, .225,
                          hi-lo-.025, .35, .23)
        for side in [-1, 1]:
            for row in range(10):
                b('stonebright' if row%3 else 'stone', side*(length/2-.21), .24+row*.46, .24,
                  .49 if row%2 else .70, .27, .28)
            # Closely stepped diagonal oak braces; no rescaling of the village wall mesh.
            for i in range(7):
                b('oak', side*(length*.42-i*.13), 4.05+i*.14, .27, .23, .23, .19)
                b('oaklight', side*(length*.42-i*.13), 4.10+i*.14, .38, .07, .12, .04)
        for a in [-length*.30, length*.30]:
            # Deep sills and window boxes begin well above the walkable ground.
            b('oakdark', a, 1.45, .46, 2.0, .39, .57)
            b('oaklight', a, 1.56, .77, 2.08, .11, .10)
            for xx in [-.90, 0, .90]: b('iron', a+xx, 1.42, .78, .07, .36, .04)
            for i in range(9):
                xx = a-.82+i*.205
                b('leaflight' if i%3 else 'leaf', xx, 1.77+(i%3)*.07, .52+(i%2)*.18, .27, .25, .29)
                if i%2 == 0: b('linen' if i%4 else 'gold', xx, 1.96+(i%3)*.07, .63, .12, .13, .12)
            # Cornice with alternating oak teeth, blue glass glints and shutter inlays.
            b('oakdark', a, 3.88, .25, 2.17, .14, .57)
            for i in range(7): b('oaklight', a-.84+i*.28, 3.77, .47, .11, .13, .12)
            b('linen', a-.45, 3.33, .139, .12, .37, .025)
            for side in [-1, 1]:
                b('gold', a+side*1.01, 2.72, .345, .10, .18, .025)
        if door:
            b('oakdark', 0, 4.03, .19, 3.58, .38, .67)
            b('oaklight', 0, 4.16, .565, 3.72, .11, .10)
            b('gold', 0, 3.98, .557, .32, .22, .06)
            for side in [-1,1]:
                for i in range(5):
                    b('leaflight' if i%2 else 'leaf', side*(.39+i*.23), 3.98+(i%2)*.07, .56, .17, .11, .07)
                b('oaklight', side*1.63, 3.91, .54, .14, .27, .10)
        self.part('roof-upper-'+name)
        # Added façade is a distinct upper storey on the inn, with its own framed windows.
        height = self.eaves-self.height
        upper=[(xx,1.0,self.height+.49,self.height+1.57) for xx in [-length*.30,0,length*.30]] if self.basekind=='inn' else []
        self.panel(b,length,self.height,self.eaves,upper)
        for yy in [self.height+.06,self.eaves-.08]:
            b('oakdark', 0, yy, .18, length+.27, .24, .34)
            b('oaklight', 0, yy+.10, .38, length+.32, .07, .09)
        for side in [-1,1]: b('oakdark', side*(length/2-.10), self.height+height/2, .18, .28, height, .34)
        if self.basekind == 'inn':
            for xx in [-length*.30,0,length*.30]:
                yy = self.height+1.03
                for dx in [-.565,.565]:b('oakdark',xx+dx,yy,.10,.13,1.32,.42)
                for dy in [-.605,.605]:b('oakdark',xx,yy+dy,.10,1.25,.13,.42)
                b('glass', xx, yy, -.06, 1.00, 1.08, .025)
                for dx in [-.30,.30]: b('oaklight', xx+dx, yy, .37, .065, 1.10, .07)
                b('oaklight', xx, yy, .37, 1.03, .08, .07)
                b('teal', xx, yy+.75, .31, 1.63, .16, .49)
                b('stonebright', xx, yy-.75, .30, 1.53, .13, .48)
                for side in [-1,1]: b('oak', xx+side*.91, yy, .23, .16, 1.69, .18)
            for side in [-1,1]:
                for i in range(9): b('oaklight',side*(length*.12+i*.10),self.height+.32+i*.16,.26,.18,.22,.17)

    def roof(self):
        if self.city:
            self.city_roof()
            return
        self.part('roof-shingles')
        tiers = 13 if self.basekind == 'inn' else 11
        rise = self.rise
        for i in range(tiers):
            w = (self.width+1.05)*(1-i/tiers)+.15
            yy = self.height+.14+i*rise/tiers
            for side in [-1,1]:
                xx = side*(w/2-.34)
                for n in range(math.ceil((self.depth+1.1)/.67)):
                    step = (self.depth+1.1)/math.ceil((self.depth+1.1)/.67)
                    zz = -(self.depth+1.1)/2+(n+.5)*step
                    self.box('rooflight' if (n+i*3)%7 == 0 else 'roofdark' if (n+i)%5 == 0 else 'teal',
                             xx, yy, zz, .86, .22, step-.018)
            if i == 0:
                for side in [-1,1]: self.box('oakdark', side*(w/2-.18), yy-.12, 0, .23, .22, self.depth+1.18)
        self.box('rooflight', 0, self.height+rise+.05, 0, .50, .22, self.depth+1.14)
        # Chimney belongs to roof so it disappears in a cutaway too.
        cx, cz = -self.width*.30, -self.depth*.23
        for i in range(8):
            self.box('stone' if i%2 else 'stonebright', cx, self.height+1.1+i*.34, cz, .85, .34, .84)
            self.box('stoneshade', cx+.43, self.height+1.2+i*.34, cz+.13, .025, .06, .23)
        self.box('stoneshade', cx, self.height+3.91, cz, 1.04, .24, 1.02)
        self.box('stonebright', cx, self.height+4.08, cz, 1.18, .14, 1.16)

    def city_roof(self):
        self.part('roof-shingles')
        b = self.box
        tiers = 20 if self.basekind == 'inn' else 17
        rows = math.ceil((self.depth+1.35)/.53)
        step = (self.depth+1.35)/rows
        for i in range(tiers):
            width = (self.width+1.35)*(1-i/tiers)+.16
            yy = self.eaves+.16+i*self.rise/tiers
            for side in [-1, 1]:
                xx = side*(width/2-.29)
                for n in range(rows):
                    tint = ['teal','teal','roofdark','teal','rooflight','teal','teal'][(n+i*3)%7]
                    b(tint, xx, yy, -(self.depth+1.35)/2+(n+.5)*step, .79, .18, step-.012)
                for zz in [-self.depth/2-.72,self.depth/2+.72]:
                    b('oakdark', xx, yy-.03, zz, .80, .21, .18)
                    b('oaklight', xx, yy+.07, zz+.04, .72, .065, .13)
                if i == 0:
                    b('oakdark',side*(width/2-.18),yy-.15,0,.27,.23,self.depth+1.55)
                    for n in range(9):
                        b('oaklight', side*(self.width/2+.14), self.eaves-.14, -self.depth/2+(n+.5)*self.depth/9,
                          .48,.24,.16)
        for n in range(rows):
            b('rooflight', 0, self.eaves+self.rise+.10, -(self.depth+1.4)/2+(n+.5)*step, .55,.25,step+.035)
        for zz in [-self.depth/2-.73,self.depth/2+.73]:
            b('oakdark',0,self.eaves+self.rise+.18,zz,.25,.65,.26)
            b('gold',0,self.eaves+self.rise+.45,zz,.18,.14,.18)

        # A projecting gabled entrance breaks the roof line without adding ground collisions.
        self.part('roof-entry-gable')
        canopy = 4.3 if self.basekind == 'inn' else 3.6
        canopy_y = self.eaves-.06
        canopy_rise = 1.78 if self.basekind == 'inn' else 1.48
        front = self.depth/2+.92
        for i in range(9):
            width = canopy*(1-i/9)
            yy = canopy_y+(i+.5)*canopy_rise/9
            b('cream', 0, yy, front-.34, width, canopy_rise/9, .24)
            b('oakdark',0,yy,front-.17,.17,canopy_rise/9+.02,.13)
            for side in [-1,1]:
                b('teal' if i%3 else 'rooflight',side*(width/2-.1),yy,front-.61,.54,.19,1.94)
                b('oaklight',side*(width/2-.1),yy+.045,front+.42,.57,.11,.13)
        b('oakdark',0,canopy_y-.05,front-.24,canopy+.25,.22,.47)
        for side in [-1,1]:
            for i in range(5): b('oak',side*(1.18+i*.16),canopy_y-.88+i*.17,front-.57,.20,.24,.23)
        b('oakdark',0,canopy_y+.69,front-.16,.60,.71,.11)
        b('gold',0,canopy_y+.69,front-.075,.33,.37,.045)

        if self.basekind == 'inn':
            # Four distinct side dormers have framed panes, their own gables and tiled caps.
            for side in [-1,1]:
                for index, zz in enumerate([-self.depth*.26,self.depth*.26]):
                    self.part(f'roof-dormer-{side}-{index}')
                    xx, base, turn = side*self.width*.37, self.eaves+1.02, side*math.pi/2
                    c, s = math.cos(turn), math.sin(turn)
                    def local(tint, dx, y, dz, w, h, d):
                        b(tint,xx+dx*c+dz*s,y,zz-dx*s+dz*c,w,h,d,turn)
                    for dx in [-1.13,1.13]:local('plaster',dx,base+.68,-.65,.28,1.36,1.62)
                    for yy,hh in [(base+.10,.20),(base+1.245,.23)]:local('plaster',0,yy,-.65,2.54,hh,1.62)
                    for dx in [-.635,.635]:local('oakdark',dx,base+.65,.15,.13,1.13,.28)
                    for dy in [-.515,.515]:local('oakdark',0,base+.65+dy,.15,1.40,.11,.28)
                    local('glass',0,base+.65,.20,1.14,.92,.025)
                    for dx in [-.36,0,.36]: local('oaklight',dx,base+.65,.34,.065,.97,.07)
                    local('oaklight',0,base+.65,.34,1.20,.075,.08)
                    local('stonebright',0,base+.02,.20,1.85,.15,.42)
                    for sign in [-1,1]: local('oak',sign*1.14,base+.65,.22,.19,1.39,.23)
                    for i in range(8):
                        width=2.85*(1-i/8)
                        yy=base+1.40+i*.145
                        local('cream',0,yy,.05,width,.15,.19)
                        for sign in [-1,1]:
                            local('rooflight' if i%3 else 'teal',sign*(width/2-.12),yy+.05,-.54,.59,.18,1.87)
                            local('oakdark',sign*(width/2-.12),yy+.025,.45,.59,.12,.12)
                    local('rooflight',0,base+2.55,-.53,.38,.20,2.05)
        self.part('roof-chimneys')
        chimneys = [(-self.width*.27,-self.depth*.24)]
        if self.basekind == 'inn': chimneys.append((self.width*.27,self.depth*.24))
        top = 11.85 if self.basekind == 'inn' else 9.73
        for cx,cz in chimneys:
            bottom = self.eaves+.25
            courses = math.ceil((top-bottom)/.31)
            for i in range(courses):
                y = bottom+(i+.5)*(top-bottom)/courses
                b('stone' if i%3 else 'stonebright',cx,y,cz,.87,(top-bottom)/courses-.012,.88)
                b('stoneshade',cx+.44,y-.025,cz+(-.16 if i%2 else .16),.025,.052,.35)
                b('stoneshade',cx+(-.16 if i%2 else .16),y+.025,cz+.45,.34,.052,.024)
            b('stoneshade',cx,top+.03,cz,1.13,.17,1.14)
            b('stonebright',cx,top+.16,cz,1.27,.13,1.28)
            for dx in [-.23,.23]:
                b('oakdark',cx+dx,top+.26,cz,.29,.11,.45)
        self.part('roof-moss')
        for i in range(15 if self.basekind == 'inn' else 10):
            xx = (-1 if i%2 else 1)*(self.width/2+.42)
            zz = -self.depth*.42+(i%8)*self.depth*.105
            b('leaf' if i%3 else 'leaflight',xx,self.eaves+.23,zz,.33,.12,.47)

    def chair(self, index, x, z, turn):
        self.part('interior-chair-'+str(index), (x,0,z), turn)
        b = self.box
        # Local +Z is the sitter's facing direction; seat top is exactly .8m.
        b('oakdark', 0,.68,0,.85,.20,.85)
        b('cloth', 0,.789,.02,.71,.022,.69)
        for side in [-1,1]:
            for zz in [-.31,.31]: b('oak',side*.31,.31,zz,.14,.62,.14)
            b('oaklight',side*.34,1.04,-.34,.115,1.16,.13)
            b('oak',side*.31,.27,0,.085,.09,.68)
            b('gold',side*.34,1.52,-.25,.055,.055,.045)
        for yy in [1.03,1.43]: b('oaklight',0,yy,-.34,.75,.13,.13)
        for xx in [-.20,0,.20]: b('oak',xx,1.23,-.34,.095,.33,.105)

    def furniture(self):
        self.part('interior-floor')
        b = self.box
        b('stoneshade',0,-.30,0,self.width+.32,.40,self.depth+.32)
        cols = math.ceil(self.width/.40)
        for n in range(cols):
            x = -self.width/2+(n+.5)*self.width/cols
            b(['plank','planklight','plankdark'][n%3],x,-.05,0,self.width/cols-.012,.10,self.depth-.02)
            for z in [-self.depth/2+.28,self.depth/2-.28]: b('iron',x,-.0005,z,.032,.001,.032)
        self.part('interior-furniture')
        # Rug edges and geometric embroidery lie almost flush to the planks.
        b('wine',0,.012,-1.5,6.30,.018,3.45)
        for xx in [-2.97,2.97]: b('gold',xx,.025,-1.5,.075,.006,3.11)
        for zz in [-3.02,.02]: b('gold',0,.025,zz,6.0,.006,.075)
        for xx in [-2.70,2.70]:
            for zz in [-2.76,-.24]: b('linen',xx,.029,zz,.15,.005,.15)
        # Table footprint is the shared collision contract, 2.2 x 1.4 at (0,-1.5).
        b('oakdark',0,.97,-1.5,2.2,.18,1.4)
        for n in range(5): b('oaklight' if n%2 else 'plank',-.88+n*.44,1.08,-1.5,.425,.045,1.4)
        for x in [-.85,.85]:
            for z in [-2,-1]: b('oak',x,.44,z,.17,.88,.17)
        b('oakdark',0,.32,-1.5,1.9,.14,.16)
        b('cloth',0,1.109,-1.5,.39,.012,1.39)
        for x,z in [(-.52,-1.70),(.61,-1.38)]:
            b('stonebright',x,1.135,z,.25,.04,.25)
            b('amber',x,1.20,z,.13,.11,.13)
        b('iron',0,1.18,-1.72,.16,.13,.16)
        b('linen',0,1.40,-1.72,.09,.35,.09)
        b('amber',0,1.60,-1.72,.08,.10,.08)
        # Supper, a travel ledger and carved serving ware make the table usable.
        for x,z in [(-.65,-1.2),(.65,-1.85)]:
            b('linen',x,1.14,z,.36,.035,.31)
            b('oakdark',x,1.18,z,.25,.06,.23)
            b('ember',x,1.22,z,.19,.035,.17)
            b('leaf',x-.04,1.25,z+.03,.07,.018,.05)
            b('iron',x+.24,1.145,z,.035,.018,.27)
        b('teal',.44,1.16,-1.13,.40,.085,.32)
        b('linen',.44,1.205,-1.13,.33,.018,.27)
        b('gold',.29,1.222,-1.13,.028,.014,.28)
        # Shelves and sleeping alcoves follow the wall, outside central circulation.
        back = -self.depth/2+.57
        b('stoneshade',0,.14,back,2.8,.28,.78)
        b('shadow',0,.90,back-.27,1.65,1.45,.10)
        for side in [-1,1]:
            for row in range(6): b('stone' if row%2 else 'stonebright',side*1.02,.32+row*.29,back,.41,.28,.70)
        b('stonebright',0,2.11,back,2.74,.32,.79)
        b('stone',0,2.91,back-.18,2.05,1.29,.39)
        b('oaklight',0,2.32,back,2.96,.16,.80)
        # Mantel clock, cookware and spice jars remain on the hearth footprint.
        b('oakdark',0,2.67,back, .55,.54,.29)
        b('linen',0,2.72,back+.16,.35,.35,.035)
        b('iron',0,2.75,back+.183,.025,.17,.015)
        b('iron',.065,2.71,back+.183,.13,.025,.015)
        for x in [-1.05,-.74,.82,1.11]:
            b('stonebright',x,2.53,back,.21,.27,.22)
            b('oak',x,2.685,back,.22,.05,.23)
        b('iron',.57,.84,back+.11,.43,.10,.42)
        b('stoneshade',.57,.67,back+.11,.38,.26,.37)
        for x in [-.50,0,.50]:
            b('oakdark',x,.32,back+.10,.23,.23,.57,.40)
            b('ember',x,.46,back+.12,.25,.16,.32)
            b('fire',x,.62,back+.10,.12,.28,.15)
        for side in [-1,1]:
            sx = side*(self.width/2-.57)
            b('oakdark',sx+side*.33,1.04,back+1.26,.10,2.08,2.28)
            for zz in [back+.14,back+2.38]: b('oak',sx,1.04,zz,.76,2.08,.10)
            for yy in [.22,.98,1.72,2.10]: b('oaklight',sx,yy,back+1.26,.80,.12,2.33)
            for i in range(9):
                zz = back+.35+i*.23
                b(['wine','teal','gold','plaster'][i%4],sx-side*.18,1.31,zz,.30,.48+(i%3)*.055,.16)
                b('gold',sx-side*.345,1.21,zz,.017,.055,.13)
            for zz in [back+.54,back+1.30,back+2.0]:
                b('stonebright',sx-side*.10,.46,zz,.32,.33,.31)
                b('amber',sx-side*.10,.68,zz,.20,.11,.19)
            # Full-width sleeping alcoves replace the former narrow cots.
            cz = 1.50 if self.basekind == 'cottage' else 2.65
            bedx=side*(self.width/2-.95)
            b('oakdark',bedx,.30,cz,1.47,.60,2.67)
            b('linen',bedx,.66,cz,1.40,.15,2.54)
            b('cloth',bedx,.78,cz+.25,1.42,.14,1.95)
            for zz in [cz-.55,cz,cz+.55,cz+1.05]: b('clothlight',bedx,.855,zz,1.38,.018,.10)
            for xx in [-.49,.49]:
                b('gold',bedx+xx,.865,cz+.25,.045,.014,1.90)
            b('linen',bedx,.88,cz-.91,1.29,.25,.50)
            b('cream',bedx,.965,cz-.91,.70,.10,.42)
            for zz in [cz-1.33,cz+1.33]: b('oaklight',bedx,.62,zz,1.50,1.18,.13)
            for xx in [-.67,.67]:
                for zz in [cz-1.31,cz+1.31]:
                    b('oak',bedx+xx,.78,zz,.14,1.56,.14)
                    b('gold',bedx+xx,1.60,zz,.18,.09,.18)
            # A bedside travel chest fits beneath the bed instead of narrowing an aisle.
            b('oaklight',bedx,.29,cz+.7,1.23,.41,.65)
            for xx in [-.45,.45]:b('iron',bedx+xx,.35,cz+1.04,.07,.40,.025)
            b('gold',bedx,.40,cz+1.065,.13,.13,.03)
            if self.city and self.basekind=='inn':
                for xx in [-.67,.67]:
                    for zz in [cz-1.31,cz+1.31]:b('oaklight',bedx+xx,2.03,zz,.12,1.02,.12)
                b('teal',bedx,2.58,cz,1.48,.13,2.73)
                for xx in [-.69,.69]:b('clothlight',bedx+xx,2.42,cz,.09,.28,2.69)
                b('gold',bedx,2.49,cz+1.36,1.48,.05,.05)
        # Wall-mounted cupboards and woven hangings use their own wall cutaways.
        for side,name in [(-1,'left'),(1,'right')]:
            self.part('shell-'+name)
            wx=side*(self.width/2-.09)
            b('oakdark',wx,3.06,0,.21,1.12,1.25)
            b('cloth',wx-side*.12,3.07,0,.035,.89,1.05)
            for zz in [-.45,.45]:b('gold',wx-side*.145,3.07,zz,.022,.91,.045)
            b('linen',wx-side*.16,3.07,0,.025,.35,.35)
        self.part('interior-furniture')
        if self.basekind == 'inn':
            b('cloth',0,.014,1.5,6.30,.020,2.10)
            for xx in [-2.97,2.97]: b('gold',xx,.028,1.5,.075,.008,1.85)
            for zz in [.58,2.42]: b('gold',0,.028,zz,6,.008,.07)
        self.chair(0,-2.8,-1.5,math.pi/2)
        self.chair(1,2.8,-1.5,-math.pi/2)
        if self.basekind == 'inn':
            self.chair(2,-2.8,1.5,math.pi/2)
            self.chair(3,2.8,1.5,-math.pi/2)

    def finish(self):
        parent = bpy.data.objects.new('house-'+self.name, None)
        library.collection.objects.link(parent)
        parent['contract'] = 'Hollow house, metre units, Y up/+Z front, floor Y=0. Open doorway 2.8 x 3.6m.'
        parent['width'], parent['depth'], parent['wallHeight'] = self.width,self.depth,self.height
        parent['doorWidth'], parent['doorHeight'] = 2.8,3.6
        if self.city: parent['cityVariant'] = self.basekind
        for name, data in self.parts.items():
            remove_hidden_box_faces(data)
            mesh = bpy.data.meshes.new(self.name+'-'+name)
            mesh.from_pydata(data['vertices'],[],data['faces'])
            mesh.materials.append(glass if name.endswith('-glass') else material)
            tint = mesh.color_attributes.new(name='HouseTint',type='BYTE_COLOR',domain='CORNER')
            for face, colour in zip(mesh.polygons,data['colors']):
                for index in face.loop_indices: tint.data[index].color=colour
            mesh.update()
            child = bpy.data.objects.new(name,mesh)
            library.collection.objects.link(child)
            child.parent = parent
            child.location = xyz(*data['pivot'])
            child.rotation_euler.z = data['rotation']
            child['part'] = name
        roots.append(parent)
        stats[self.name] = {'cubes':self.cubes,'triangles':sum(len(face)-2 for part in self.parts.values() for face in part['faces']),'drawCalls':len(self.parts),
                            'footprint':[self.width,self.depth],'door':[2.8,3.6],
                            'height':max(vertex[2] for part in self.parts.values() for vertex in part['vertices'])}

for name,w,d,h in [('cottage',10,9,5.2),('inn',14,12,5.5),('city-cottage',10,9,5.2),('city-inn',14,12,5.5)]:
    house = House(name,w,d,h,city=name.startswith('city-'))
    house.wall('front',w,0,d/2,0,True)
    house.wall('back',w,0,-d/2,math.pi)
    house.wall('left',d,-w/2,0,-math.pi/2)
    house.wall('right',d,w/2,0,math.pi/2)
    house.roof()
    house.furniture()
    house.finish()

for path in [EXPORT.parent,SOURCE.parent]: path.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,
                         export_yup=True,export_apply=True,export_animations=False,
                         export_cameras=False,export_lights=False,export_extras=True)
if '--optimize' in sys.argv:
    cli = ['npx','--yes','@gltf-transform/cli@4.5.0']
    with tempfile.TemporaryDirectory(prefix='mossvale-houses-') as temporary:
        paths = [str(EXPORT)] + [str(Path(temporary)/str(i))+'.glb' for i in range(3)]
        for command in [
            ['weld',paths[0],paths[1]],
            ['quantize',paths[1],paths[2],'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],
            ['dedup',paths[2],paths[3]],['prune',paths[3],paths[0]],
        ]: subprocess.run(cli+command,check=True)
    raw = EXPORT.read_bytes()
    length = struct.unpack_from('<I',raw,12)[0]
    document = json.loads(raw[20:20+length])
    for field in ['extensionsUsed','extensionsRequired']:
        document[field] = sorted(set(document.get(field,[])+['KHR_mesh_quantization']))
    encoded = json.dumps(document,separators=(',',':')).encode()
    encoded += b' '*(-len(encoded)%4)
    tail = raw[20+length:]
    EXPORT.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+
                       struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)

# A separate scene shows complete silhouettes alongside genuine furnished cutaways.
gallery = bpy.data.scenes.new('Houses and walkable interiors')
bpy.context.window.scene = gallery
for source,at,cutaway in [(roots[0],(-10,0,-18),False),(roots[1],(10,0,-18),False),
                          (roots[2],(-10,0,0),False),(roots[3],(10,0,0),False),
                          (roots[2],(-10,0,18),True),(roots[3],(10,0,18),True)]:
    parent = source.copy()
    gallery.collection.objects.link(parent)
    parent.location = xyz(*at)
    for child in source.children:
        part = child.get('part',child.name.split('.')[0])
        if cutaway and part.startswith(('roof-','shell-front','shell-right')): continue
        obj = child.copy()
        obj.data = child.data
        gallery.collection.objects.link(obj)
        obj.parent = parent
    if cutaway:
        bpy.ops.object.light_add(type='AREA',location=xyz(at[0],6,at[2]))
        light=bpy.context.object
        light.data.energy=650
        light.data.size=7
        light.data.color=(1,.82,.59)

bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.52))
ground = bpy.context.object
ground.name = 'Gallery ground - not exported'
ground_material = bpy.data.materials.new('House gallery ground')
ground_material.diffuse_color = (.07,.105,.09,1)
ground.data.materials.append(ground_material)
def aim(obj,at): obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(32,48,65))
camera=bpy.context.object
camera.data.type='ORTHO'
camera.data.ortho_scale=60
aim(camera,(0,1.7,0))
gallery.camera=camera
for at,power,size in [((-20,24,15),5500,14),((14,20,3),3500,12)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*at))
    light=bpy.context.object
    light.data.energy=power
    light.data.size=size
    aim(light,(0,2,0))
bpy.ops.object.light_add(type='SUN',location=xyz(-15,24,16))
sun=bpy.context.object
sun.data.energy=2.0
sun.data.angle=.18
aim(sun,(0,0,0))
gallery.world=bpy.data.worlds.new('House gallery sky')
gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.15,.20,.23,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
gallery.render.engine='CYCLES'
gallery.cycles.samples=32
gallery.cycles.use_denoising=True
gallery.render.resolution_x=2100
gallery.render.resolution_y=2000
gallery.render.resolution_percentage=100
gallery.render.image_settings.file_format='PNG'
gallery.render.filepath=str(PREVIEW)
gallery.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('HOUSE_ASSETS '+json.dumps({'models':stats,'glb_bytes':EXPORT.stat().st_size,'blend_bytes':SOURCE.stat().st_size}))
if '--render' in sys.argv: bpy.ops.render.render(write_still=True)
