"""Blender-authored Plagueworks, Emberfall and Veilhaven modular dungeon art.
Blender --background --python scripts/build-themed-dungeons.py -- --render --optimize
Original meshes, metre pivots, vertex colour palettes; runtime owns collision and animation.
"""
import bpy, math, random, json, subprocess, sys, tempfile
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
THEMES={
 'plagueworks': {'stone':'647365','light':'A0A38A','dark':'293E36','trim':'90805C','metal':'53645D','wood':'47392B','glow':'A2FB56','hot':'D4FF88','liquid':'3D973B','accent':'A78A73'},
 'emberfall': {'stone':'3D3E44','light':'868782','dark':'22272E','trim':'B78950','metal':'A1A4A5','wood':'584338','glow':'FF651D','hot':'FFD07A','liquid':'FA4B0E','accent':'986140'},
 'veilhaven': {'stone':'3B655D','light':'66877A','dark':'241E22','trim':'C2984F','metal':'52615C','wood':'442423','glow':'72E6DB','hot':'FFBC4A','liquid':'286D79','accent':'8D2924','screen':'B9211E','portal':'639BFF'},
}
parts={}; current=''; override=None; palette={}; theme=''; rng=random.Random(912781)
def xyz(x,y,z): return (x,-z,y)
def color(v):
    return tuple(((int(v[i:i+2],16)/255+.055)/1.055)**2.4 if int(v[i:i+2],16)/255>.04045 else int(v[i:i+2],16)/255/12.92 for i in (0,2,4))+(1,)
def prop(name):
    global current; current=name; parts[name]={}
def mesh(tint,vertices,faces,glow=False):
    role=override or ('glow' if glow else 'stone'); data=parts[current].setdefault(role,{'vertices':[],'faces':[],'colors':[]}); first=len(data['vertices'])
    data['vertices'] += [xyz(*p) for p in vertices]; data['faces'] += [tuple(first+i for i in face) for face in faces]; data['colors'] += [palette[tint]]*len(faces)
def box(tint,x,y,z,w,h,d,turn=0,glow=False):
    c,s=math.cos(turn),math.sin(turn)
    mesh(tint,[(x+a*w/2*c+b*d/2*s,y+v*h/2,z-a*w/2*s+b*d/2*c) for a,v,b in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],glow)
def rod(tint,a,b,r=.03,segments=6,glow=False):
    a,b=Vector(a),Vector(b); normal=(b-a).normalized(); u=normal.cross(Vector((0,1,0)))
    if u.length<.01: u=normal.cross(Vector((1,0,0)))
    u.normalize(); v=normal.cross(u); vertices=[]
    for p in [a,b]:
        for i in range(segments): vertices.append(tuple(p+(u*math.cos(i*math.tau/segments)+v*math.sin(i*math.tau/segments))*r))
    faces=[tuple(reversed(range(segments))),tuple(range(segments,segments*2))]+[(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
    mesh(tint,vertices,faces,glow)
def lathe(tint,x,y,z,profile,segments=12,glow=False):
    vertices=[(x+r*math.cos(i*math.tau/segments),y+h,z+r*math.sin(i*math.tau/segments)) for h,r in profile for i in range(segments)]
    faces=[tuple(reversed(range(segments))),tuple(range((len(profile)-1)*segments,len(profile)*segments))]
    for row in range(len(profile)-1):
        for i in range(segments): faces.append((row*segments+i,row*segments+(i+1)%segments,(row+1)*segments+(i+1)%segments,(row+1)*segments+i))
    mesh(tint,vertices,faces,glow)
def rune(x,y,z,size=.07,tint='glow',pattern=0):
    rows=[['00100','01110','10101','00100','01010','10001'],['00100','01110','11011','01010','01010','11111'],['11111','00100','11111','10001','10101','11111']][pattern]
    for row,line in enumerate(rows):
        for col,p in enumerate(line):
            if p=='1': box(tint,x+(col-2)*size,y+(2.5-row)*size,z,size*.68,size*.68,.022,glow=tint in ['glow','hot'])
def ring(tint,x,y,z,r,thickness=.027,vertical=False,glow=False):
    count=16
    for i in range(count):
        a,b=i*math.tau/count,(i+1)*math.tau/count
        rod(tint,(x+r*math.cos(a),y+r*math.sin(a) if vertical else y,z if vertical else z+r*math.sin(a)),(x+r*math.cos(b),y+r*math.sin(b) if vertical else y,z if vertical else z+r*math.sin(b)),thickness,5,glow)
def valve(x,y,z,r=.29):
    # Broad handwheel rim and four spokes remain legible from the game camera.
    count=10
    vertices=[(x+math.cos(i*math.tau/count)*radius,y+math.sin(i*math.tau/count)*radius,z+depth) for depth in [-.025,.025] for radius in [r-.045,r] for i in range(count)]
    faces=[]
    for i in range(count):
        j=(i+1)%count
        faces += [(i,j,count+j,count+i),(2*count+i,3*count+i,3*count+j,2*count+j),(i,2*count+i,2*count+j,j),(count+i,count+j,3*count+j,3*count+i)]
    mesh('trim',vertices,faces)
    for a in [0,math.pi/2]: rod('metal',(x-math.cos(a)*r,y-math.sin(a)*r,z),(x+math.cos(a)*r,y+math.sin(a)*r,z),.031,5)
    box('trim',x,y,z,.13,.13,.10)
def chain(x,y,z,length):
    for i in range(int(length/.13)):
        yy=y-i*.13
        ring('metal',x,yy,z,.075,.018,True)
        if i%2: rod('trim',(x-.075,yy,z),(x+.075,yy,z),.021)
def brickwork():
    box('dark',0,2.13,0,4,4.26,.94)
    for row in range(8):
        edges=[-2,-1,0,1,2] if row%2==0 else [-2,-1.5,-.5,.5,1.5,2]
        for a,b in zip(edges,edges[1:]): box(rng.choice(['stone','stone','light']), (a+b)/2,.33+row*.47,0,b-a-.045,.425,1.01+rng.random()*.06)
    for y,h,w in [(.08,.16,4),(.24,.11,3.98),(4.05,.13,4),(4.23,.22,4),(4.385,.03,3.94)]: box('trim' if y==4.05 else 'light',0,y,0,w,h,1.15)
def roots(x,z,height):
    for branch in range(3):
        for i in range(11):
            a=(x+math.sin(i*.65+branch)*.11,i*height/11,z+branch*.07)
            b=(x+math.sin((i+1)*.65+branch)*.11,(i+1)*height/11,z+branch*.07)
            rod('wood',a,b,.05+branch*.015,5)
    for i in range(6): lathe('glow',x+.09*math.sin(i*2),.3+i*.36,z+.1,[(0,.045),(.055,.10),(.13,.06)],6,True)
def skull(x,y,z,s=.25):
    lathe('light',x,y,z,[(-s*.5,s*.5),(0,s*.73),(s*.48,s*.65),(s*.65,s*.38)],8)
    for dx in [-.26,.26]: box('dark',x+dx*s,y+.13*s,z+.63*s,s*.24,s*.22,.02)
    box('dark',x,y-.08*s,z+.69*s,s*.13,s*.16,.023)
    for i in range(4): box('light',x+(i-1.5)*s*.16,y-.35*s,z+.47*s,s*.12,s*.19,s*.2)
def flask(x,y,z,scale=1):
    lathe('metal',x,y,z,[(0,.14*scale),(.03*scale,.20*scale),(.30*scale,.15*scale),(.38*scale,.065*scale),(.53*scale,.065*scale)],8)
    lathe('glow',x,y+.06*scale,z,[(0,.145*scale),(.22*scale,.12*scale)],8,True)
    box('wood',x,y+.54*scale,z,.16*scale,.06*scale,.16*scale)
def roof(x,y,z,w,d):
    # Layered jade tiles sweep upward at the eaves, with carved ridge finials.
    for side in [-1,1]:
        for row in range(5):
            xx=side*(row+.5)*w/10; yy=y+.55-row*.12+max(0,row-2)**2*.04
            box('stone' if row%2 else 'dark',x+xx,yy,z,w/10+.06,.12,d)
            for k in range(max(2,int(d/.23))): rod('light',(x+xx-w/22,yy+.075,z-d/2+.12+k*.23),(x+xx+w/22,yy+.075,z-d/2+.12+k*.23),.025,5)
        rod('trim',(x+side*w/2,y+.31,z-d/2),(x+side*(w/2+.12),y+.66,z-d/2),.06)
    rod('trim',(x,y+.68,z-d/2-.1),(x,y+.68,z+d/2+.1),.065)
def wall(special=False):
    if theme!='veilhaven': brickwork()
    else:
        box('dark',0,2.2,0,4,4.4,1.05)
        for x in [-1.86,1.86]:
            box('wood',x,2.2,0,.26,4.4,1.16)
            for y in [.2,.45,3.8,4.18]: box('trim',x,y,0,.29,.12,1.18)
        for y in [.12,.35,1.18,3.57,3.85,4.20]: box('wood' if y>1 else 'stone',0,y,0,3.7,.17,1.13)
        for side in [-1,1]:
            box('accent',0,2.36,side*.54,3.4,2.12,.035)
            box('screen',0,2.36,side*.563,3.20,1.96,.016,glow=True)
            for i in range(15): box('wood',-1.54+i*.22,2.36,side*.589,.075,2.12,.022)
            for i in range(10): box('wood',0,1.38+i*.22,side*.589,3.2,.060,.022)
            for y in [1.22,3.51,4.04]: box('trim',0,y,side*.581,3.52,.055,.022)
            for x in [-1.65,1.65]: box('trim',x,2.36,side*.60,.055,2.21,.018)
            for x in [-1.65,1.65]:
                for y in [1.25,3.47]:
                    box('trim',x,y,side*.616,.19,.18,.030)
                    box('dark',x,y,side*.637,.075,.07,.018)
            for x in [-1.24,0,1.24]:
                box('stone',x,.77,side*.567,1.07,.59,.034)
                box('trim',x,.78,side*.589,.32,.25,.023)
                box('dark',x,.78,side*.603,.20,.13,.012)
            if special:
                # Gold-stitched hanging banners break up the red lattice screens.
                box('dark',0,2.32,side*.64,1.20,2.91,.035)
                for x in [-.57,.57]: box('trim',x,2.32,side*.67,.055,2.91,.020)
                box('trim',0,3.80,side*.67,1.40,.11,.040)
                mesh('dark',[(x,y,side*.66+dz) for dz in [-.012,.012] for x,y in [(-.6,.865),(.6,.865),(0,.59)]],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)])
                for y,pattern in [(1.50,2),(2.39,1),(3.25,2)]: rune(0,y,side*.693,.105,'trim',pattern)
                for x in [-.52,.52]: box('trim',x,.82,side*.671,.06,.16,.023)
                for x in [-1.37,1.37]:
                    # Shallow amber sconces stay within the same solid wall envelope.
                    box('dark',x,2.65,side*.626,.38,.62,.060)
                    box('hot',x,2.65,side*.671,.29,.46,.035,glow=True)
                    for dx in [-.16,0,.16]: box('wood',x+dx,2.65,side*.703,.035,.53,.030)
                    for y in [2.36,2.93]: box('trim',x,y,side*.671,.45,.075,.11)
            # Stepped corbels and inset crests make the upper beam read as carved timber.
            for x in [-1.36,0,1.36]:
                for y,w,d in [(3.61,.31,.055),(3.71,.43,.09),(3.82,.58,.12)]: box('wood',x,y,side*.608,w,.11,d)
                box('trim',x,3.76,side*.678,.31,.06,.028)
                box('trim',x,4.02,side*.625,.34,.28,.045)
                box('dark',x,4.02,side*.653,.22,.17,.02)
                box('trim',x,4.02,side*.670,.08,.11,.018)
    if theme=='plagueworks':
        for side in [-1,1]:
            if special:
                # Specimen shelves and ossuary niches are modeled into the wall envelope.
                for row in range(3):
                    box('dark',0,.77+row*.85,side*.545,2.84,.66,.05)
                    box('trim',0,.44+row*.85,side*.566,3,.08,.05)
                    for i in range(5):
                        x=(i-2)*.52
                        if row==0: skull(x,.68+row*.85,side*.55,.23)
                        else: flask(x,.49+row*.85,side*.62,.70)
                for i in range(8): box('metal',-1.76+i*.5,3.73,side*.55,.18,.18,.08)
                for x in [-1.52,1.52]:
                    box('metal',x,1.59,side*.61,.13,2.80,.15)
                    for y in [.46,2.83]: box('trim',x,y,side*.707,.21,.17,.045)
                for x in [-.53,.53]: box('glow',x,2.30,side*.73,.14,.38,.04,glow=True)
            else:
                for x in [-1.52,1.44]: roots(x,side*.37,3.80)
                for x in [-.75,.8]:
                    box('dark',x,2.1,side*.56,.68,1.65,.032)
                    for row in range(3): skull(x,1.61+row*.39,side*.45,.24)
            rod('metal',(-1.92,3.37,side*.54),(1.92,3.37,side*.54),.04)
            for x in [-1.25,1.25]: ring('trim',x,3.37,side*.57,.15,.023,True)
            rod('metal',(-1.89,3.56,side*.66),(1.89,3.56,side*.66),.10,8)
            rod('metal',(-1.02,3.56,side*.66),(-1.02,2.81,side*.66),.09,8)
            for x in [-1.59,.32,1.57]: box('trim',x,3.56,side*.67,.14,.29,.23)
            valve(-1.02,3.10,side*.80,.31)
            box('dark',.90,.76,side*.605,1.34,.57,.075)
            box('liquid',.90,.76,side*.653,1.16,.41,.035)
            for x in [.40,.65,.90,1.15,1.40]: box('metal',x,.76,side*.688,.09,.48,.055)
            for y in [.48,1.03]: box('trim',.9,y,side*.662,1.40,.075,.070)
    if theme=='emberfall':
        for side in [-1,1]:
            box('dark',0,2.15,side*.546,2.25,3.26,.04)
            for x in [-1.25,1.25]:
                box('trim',x,2.15,side*.57,.12,3.39,.04)
                for y in [.56,1.38,2.80,3.72]: box('metal',x,y,side*.598,.2,.12,.035)
            if special:
                for i in range(6):
                    y=.94+i*.39
                    box('glow',0,y,side*.57,1.8,.12,.025,glow=True)
                    for x in [-.72,-.36,0,.36,.72]: box('metal',x,y,side*.59,.095,.34,.035)
                for x in [-.6,.6]: chain(x,3.58,side*.48,2.8)
            else:
                rune(0,2.23,side*.595,.26,pattern=1)
                for x in [-.76,.76]: rod('glow',(x,.6,side*.594),(x,3.68,side*.594),.023,4,True)
            for x in [-1.64,1.64]:
                box('dark',x,2.24,side*.60,.40,2.98,.11)
                box('metal',x,2.23,side*.67,.13,3.01,.055)
                for y in [.84,1.57,2.30,3.03,3.63]: box('trim',x,y,side*.710,.23,.14,.044)
                box('trim',x,3.86,side*.63,.40,.15,.21)
                box('dark',x,3.86,side*.747,.22,.075,.022)
            for y in [.35,3.98]:
                box('metal',0,y,side*.64,3.52,.20,.16)
                for x in [-1.46,-.74,0,.74,1.46]: box('trim',x,y,side*.744,.13,.13,.053)
            if not special:
                box('metal',0,.88,side*.626,1.43,.57,.15)
                box('glow',0,.88,side*.712,1.20,.39,.035,glow=True)
                for x in [-.48,-.24,0,.24,.48]: box('dark',x,.88,side*.748,.10,.46,.045)

def pillar(guardian=False):
    height=3.935 if guardian else 4.535
    for y,w,h in [(.1,1.6,.2),(.26,1.48,.12),(.45,1.18,.26),(height-.36,1.25,.18),(height-.15,1.59,.30)]: box('trim' if y==.26 else 'wood' if theme=='veilhaven' and y>1 else 'light',0,y,0,w,h,w)
    box('wood' if theme=='veilhaven' else 'stone',0,(height-.78)/2+.58,0,1.03,height-.78,1.05)
    for side in [-1,1]:
        for x in [-.38,.38]:
            box('trim',x,1.96,side*.542,.07,2.50,.034)
            for y in [.8,1.4,2.6,3.0]: box('metal',x,y,side*.57,.13,.07,.026)
        if guardian:
            # A carved plague physician, forge ancestor or temple guardian.
            box('dark',0,1.89,side*.555,.57,1.18,.06)
            for i in range(7): box('light',0,1.21+i*.125,side*(.55+i*.011),.56-i*.037,.13,.11)
            box('light',0,2.64,side*.51,.65,.61,.30)
            for x in [-.19,.19]: box('glow',x,2.68,side*.682,.10,.06,.024,glow=True)
            if theme=='plagueworks': rod('trim',(0,2.55,side*.64),(0,2.30,side*.76),.13,6)
            if theme=='emberfall':
                for i in range(5): box('trim',(i-2)*.13,2.27,side*.64,.11,.50-abs(i-2)*.07,.16)
                box('metal',0,2.98,side*.51,.81,.18,.38)
            if theme=='veilhaven':
                box('trim',0,3.04,side*.52,.84,.13,.31)
                for x in [-.29,0,.29]: box('accent',x,3.18,side*.53,.10,.23,.15)
        else: rune(0,2.08,side*.586,.13,pattern=1 if theme=='emberfall' else 2 if theme=='veilhaven' else 0)
    if theme=='plagueworks':
        roots(-.59,.45,height-.25)
        for face in range(4):
            angle=face*math.pi/2;c,s=math.cos(angle),math.sin(angle)
            for dx in [-.45,.45]:
                rod('metal',(c*dx+s*.59,.64,-s*dx+c*.59),(c*dx+s*.59,height-.47,-s*dx+c*.59),.063,6)
                for y in [.96,2.0,3.17]: box('trim',c*dx+s*.621,y,-s*dx+c*.621,.18,.11,.14,angle)
            if face%2:
                box('dark',s*.55,2.00,c*.55,.66,2.48,.065,angle)
                box('liquid',s*.595,2.00,c*.595,.42,2.17,.033,angle)
                for y in [1.15,1.58,2.01,2.44,2.87]: box('metal',s*.63,y,c*.63,.52,.11,.042,angle)
                box('glow',s*.661,2.83,c*.661,.25,.16,.025,angle,True)
        for side in [-1,1]: valve(0,height-.78,side*.64,.23)
    elif theme=='emberfall':
        for x in [-.58,.58]:
            for z in [-.58,.58]: rod('metal',(x,.55,z),(x,height-.49,z),.045)
        for face in range(4):
            angle=face*math.pi/2;c,s=math.cos(angle),math.sin(angle)
            if face%2:
                box('dark',s*.55,2.05,c*.55,.71,2.63,.07,angle)
                for dx in [-.22,.22]: box('glow',c*dx+s*.599,2.04,-s*dx+c*.599,.12,2.14,.035,angle,True)
                for y in [1.10,1.57,2.04,2.51,2.98]: box('metal',s*.64,y,c*.64,.69,.12,.07,angle)
            for dx in [-.50,.50]:
                box('metal',c*dx+s*.567,2.01,-s*dx+c*.567,.13,2.97,.10,angle)
                for y in [.70,1.31,2.69,3.27]: box('trim',c*dx+s*.632,y,-s*dx+c*.632,.18,.14,.06,angle)
            box('dark',s*.62,height-.36,c*.62,.58,.25,.12,angle)
            box('trim',s*.700,height-.36,c*.700,.26,.13,.07,angle)
    else:
        for x in [-.58,.58]: rod('accent',(x,.57,.52),(x,height-.47,.52),.05)
        for y,w in [(.61,1.12),(height-.49,1.13),(height-.29,1.56)]: box('trim',0,y,0,w,.07,w)
        for y,w,h in [(.70,1.20,.12),(.81,1.09,.10),(height-.61,1.08,.13),(height-.45,1.36,.12),(height-.23,1.58,.08)]: box('stone' if y<1 else 'wood',0,y,0,w,h,w)
        # Every face is carved: room placements rotate these pillars toward the center.
        for face in range(4):
            angle=face*math.pi/2;c,s=math.cos(angle),math.sin(angle)
            box('stone',s*.553,2.04,c*.553,.64,2.40,.045,angle)
            for dx in [-.38,.38]:
                box('trim',c*dx+s*.588,2.04,-s*dx+c*.588,.085,2.54,.050,angle)
                for y in [.90,3.17]: box('trim',c*dx+s*.613,y,-s*dx+c*.613,.19,.18,.048,angle)
            if face%2:
                for y in [1.32,2.08,2.83]:
                    box('trim',s*.593,y,c*.593,.40,.40,.065,angle)
                    box('dark',s*.631,y,c*.631,.27,.27,.022,angle)
                    box('trim',s*.652,y,c*.652,.105,.105,.024,angle)
            lamp_y=height-.86
            box('trim',s*.578,lamp_y,c*.578,.38,.35,.070,angle)
            box('hot',s*.627,lamp_y,c*.627,.25,.22,.035,angle,True)
            box('wood',s*.654,lamp_y,c*.654,.036,.24,.025,angle)
        for side in [-1,1]:
            for x in [-.56,.56]:
                box('accent',x,2.10,side*.54,.10,2.50,.08)
                for y in [1.02,3.18]: box('trim',x,y,side*.59,.18,.15,.05)
            for x in [-.45,0,.45]:
                box('trim',x,height-.34,side*.72,.12,.14,.09)
                box('dark',x,height-.33,side*.776,.052,.065,.018)
            for x in [-.42,0,.42]: box('trim',x,.42,side*.607,.11,.14,.035)
        for face in range(4):
            angle=face*math.pi/2;c,s=math.cos(angle),math.sin(angle)
            for y,w,r in [(height-.70,.39,.60),(height-.61,.53,.65),(height-.52,.69,.70)]: box('wood',s*r,y,c*r,w,.095,.105,angle)
            box('trim',s*.759,height-.57,c*.759,.37,.055,.034,angle)
def arch():
    for side in [-1,1]:
        x=side*3.6
        box('light',x,.15,0,1.05,.3,1.17)
        box('wood' if theme=='veilhaven' else 'stone',x,2.12,0,.88,3.94,1.06)
        for y in [.4,1.0,3.3,4.1]: box('trim',x,y,0,1.06,.15,1.17)
        rune(x,2.25,.55,.13,pattern=2 if theme=='veilhaven' else 1 if theme=='emberfall' else 0)
        if theme=='plagueworks': roots(x+.28,.32,4.00)
    if theme=='veilhaven':
        box('wood',0,4.30,0,8.2,.40,1.0); roof(0,4.42,0,8.8,1.3)
        box('accent',0,4.32,.55,1.6,.43,.14); rune(0,4.35,.636,.053,pattern=2)
        for x in [-2.1,2.1]: chain(x,4.1,0,.62); lathe('trim',x,3.31,0,[(0,.22),(.10,.19),(.25,.15),(.35,.07)],10)
    else:
        for side in [-1,1]:
            for i in range(5): box('light' if i%2 else 'stone',side*(2.90-i*.62),4.31+i*.27,0,1.07,.52,1.17)
        box('trim',0,5.77,0,.9,.8,1.30); rune(0,5.8,.67,.095,pattern=1 if theme=='emberfall' else 0)
        if theme=='emberfall':
            for side in [-1,1]: rod('glow',(side*2.9,4.32,.606),(side*.26,5.44,.606),.035,4,True)
def lantern():
    if theme=='veilhaven':
        # Broad amber lanterns on jade plinths, within the original roof footprint.
        for y,w,h,tint in [(.09,.86,.18,'stone'),(.23,.71,.10,'light'),(.32,.58,.08,'trim'),(.93,.39,1.14,'wood'),(1.55,.59,.12,'trim'),(1.65,.75,.10,'dark')]: box(tint,0,y,0,w,h,w)
        for side in [-1,1]:
            box('trim',0,.94,side*.21,.24,.68,.035)
            box('dark',0,.94,side*.232,.14,.54,.022)
            rune(0,.98,side*.249,.036,'trim',2)
        box('hot',0,2.22,0,.57,.99,.57,glow=True)
        for x in [-.31,.31]:
            for z in [-.31,.31]: box('wood',x,2.21,z,.085,1.09,.085)
        for side in [-1,1]:
            for x in [-.105,.105]:
                box('wood',x,2.22,side*.316,.033,.99,.033)
                box('wood',side*.316,2.22,x,.033,.99,.033)
            for y in [1.85,2.55]:
                box('trim',0,y,side*.32,.64,.042,.035)
                box('trim',side*.32,y,0,.035,.042,.64)
            for y in [2.05,2.39]:
                box('trim',0,y,side*.342,.13,.13,.025)
                box('trim',side*.342,y,0,.025,.13,.13)
            box('dark',0,.47,side*.302,.38,.20,.028)
            box('trim',side*.302,.47,0,.028,.20,.38)
        for y,w,h,tint in [(1.72,.73,.12,'trim'),(2.76,.78,.12,'trim'),(2.88,.90,.12,'dark'),(3.02,.72,.16,'wood'),(3.15,.49,.10,'trim')]: box(tint,0,y,0,w,h,w)
        for x in [-.35,.35]:
            for z in [-.35,.35]: box('trim',x,2.98,z,.10,.21,.10)
        lathe('trim',0,3.20,0,[(0,.11),(.09,.16),(.20,.08),(.31,.055)],8)
    else:
        box('stone',0,.06,0,.42,.12,.42); rod('metal',(0,.12,0),(0,2.4,0),.07)
        for y in [.18,1.2,2.38]: lathe('trim',0,y,0,[(0,.11),(.07,.11)],8)
        lathe('metal',0,2.4,0,[(0,.11),(.12,.30),(.18,.31)],10)
        for i in range(7):
            a=i*2.4; lathe('hot' if i%2 else 'glow',math.sin(a)*.13,2.57+(i%2)*.08,math.cos(a)*.13,[(0,.11),(.22,.08),(.40,.013)],6,True)
        for x in [-.25,.25]: rod('metal',(x,2.52,0),(x,3.04,0),.028)
        for y,w,h in [(.09,.53,.18),(.23,.41,.10),(.34,.31,.12)]: box('metal' if theme=='emberfall' else 'stone',0,y,0,w,h,w)
        for y in [.53,1.77,2.24]: lathe('trim',0,y,0,[(0,.11),(.06,.14),(.13,.11)],8)
        for face in range(4):
            a=face*math.pi/2
            rod('metal',(math.sin(a)*.27,2.53,math.cos(a)*.27),(math.sin(a)*.27,3.02,math.cos(a)*.27),.034,5)
        for y in [2.54,2.99]: ring('trim',0,y,0,.28,.034)
        if theme=='plagueworks':
            lathe('glow',0,.83,0,[(0,.095),(.56,.095)],8,True)
            for x in [-.15,.15]: rod('metal',(x,.78,0),(x,1.45,0),.026,5)
        else:
            for side in [-1,1]:
                box('dark',0,1.15,side*.085,.23,.72,.035)
                box('glow',0,1.15,side*.112,.07,.57,.025,glow=True)
def pool():
    box('dark',0,-.49,0,3.8,.08,2.9)
    for side in [-1,1]:
        box('stone',0,-.22,side*1.325,3.8,.44,.25);box('stone',side*1.775,-.22,0,.25,.44,2.4)
        for i in range(7): box('trim' if i%3==0 else 'light',-1.59+i*.53,.028,side*1.325,.51,.056,.25)
        for i in range(5): box('light',side*1.775,.028,-1.04+i*.52,.25,.056,.50)
    global override; override='water';mesh('liquid',[(-1.65,-.06,-1.2),(-1.65,-.06,1.2),(1.65,-.06,1.2),(1.65,-.06,-1.2)],[(0,1,2,3)]); override=None
    for i in range(9):
        x,z=math.sin(i*3.7)*1.38,math.cos(i*1.6)*.93
        ring('glow',x,-.046,z,.055+i%3*.044,.009,glow=True)
    if theme=='emberfall':
        for i in range(5):
            x=-1.3+i*.65; rod('hot',(x,-.04,-1.12),(x+.22,-.04,1.12),.012,4,True)
        for side in [-1,1]:
            for i in range(5):
                x=-1.35+i*.675
                box('metal',x,.068,side*1.325,.13,.05,.28)
                box('glow',x,.098,side*1.325,.06,.013,.17,glow=True)
    elif theme=='plagueworks':
        for side in [-1,1]:
            for i in range(7):box('metal',-1.5+i*.5,.065,side*1.32,.13,.035,.24)
            rod('metal',(side*1.56,-.01,-.91),(side*1.56,-.01,.91),.07,6)
def gate():
    global override
    for x in [-4.12,4.12]:
        box('stone',x,2.2,0,.24,4.4,.45)
        for y in [.2,2.1,4.20]: box('trim',x,y,.25,.25,.16,.07)
    box('stone',0,4.43,0,8.48,.34,.56); override='leaf'
    for i in range(19):
        x=(i-9)*.41;box('wood' if theme=='veilhaven' else 'metal',x,2.2,0,.13,4.18,.17)
        for y in [.2,1.0,3.5]: box('trim',x,y,.11,.16,.12,.04)
    for y in [.39,1.55,3.31,4.19]: box('trim',0,y,0,7.70,.12,.23)
    box('dark',0,2.47,.18,1.06,1.24,.15); override=None;rune(0,2.47,.276,.17,pattern=1 if theme=='emberfall' else 2 if theme=='veilhaven' else 0)
def chest():
    global override
    box('dark',0,.07,0,1.32,.14,1.02);box('wood',0,.34,0,1.24,.45,.95)
    for i in range(7): box('accent',-.51+i*.17,.33,.49,.12,.35,.04)
    override='lid'
    for i in range(3): box('wood' if i%2 else 'accent',0,.59+i*.12,0,1.26,.14,.94-i*.16)
    for x in [-.47,.47]: box('trim',x,.79,0,.10,.12,.70)
    override=None
    for x in [-.47,.47]:
        box('trim',x,.33,.53,.10,.51,.05)
        for y in [.15,.45]: box('metal',x,y,.565,.05,.05,.03)
    box('metal',0,.54,.54,.24,.3,.075); box('glow',0,.56,.59,.07,.12,.03,glow=True)
def marker(checkpoint=False):
    for i in range(24):
        a=i*math.tau/24;box('trim',math.cos(a)*1.2,.025,math.sin(a)*1.2,.24,.05,.16,-a)
        if i%2==0:box('glow',math.cos(a)*.95,.069,math.sin(a)*.95,.075,.045,.075,glow=True)
    if checkpoint:
        lathe('glow',0,.70,0,[(0,0),(.45,.25),(.80,.12),(1.03,0)],6,True)
        for y in [.80,1.17,1.50]: ring('trim',0,y,0,.47-.07*(y-.8),.022)
    else:
        for a in [0,math.pi/3,math.pi*2/3]: box('glow',0,.063,0,.06,.05,1.4,a,True)
def mushrooms():
    for i in range(5):
        x,z=math.sin(i*3.2)*.33,math.cos(i*3.2)*.33;h=.24+(i%3)*.13
        lathe('light',x,0,z,[(0,.04),(h,.05)],6);lathe('glow',x,h,z,[(0,.16),(.09,.13),(.13,.04)],8,True)
def landmark():
    # Each hero set stays inside a 3.8 x 2.9m pool collider; silhouettes rise above its back edge.
    if theme=='plagueworks':
        for x in [-1.0,1.0]:
            lathe('metal',x,.09,-.52,[(0,.44),(.13,.48),(.22,.36),(.3,.36)],12)
            lathe('liquid',x,.4,-.52,[(0,.28),(.15,.32),(1.80,.32),(1.95,.23)],12,True)
            for y in [.44,.70,1.14,1.62,2.10,2.38]: ring('trim',x,y,-.52,.37,.04)
            for i in range(6):
                a=i*math.tau/6;rod('metal',(x+.36*math.cos(a),.45,-.52+.36*math.sin(a)),(x+.36*math.cos(a),2.40,-.52+.36*math.sin(a)),.026)
            lathe('metal',x,2.36,-.52,[(0,.37),(.16,.41),(.28,.28),(.42,.17)],10)
            rod('trim',(x,2.77,-.52),(x,3.03,-.52),.12,8)
            rod('trim',(x,3.03,-.52),(0,3.03,-.52),.12,8)
            skull(x,1.42,-.22,.26)
        box('stone',0,.24,.69,2.70,.3,.77)
        for i in range(4): flask(-.86+i*.55,.4,.69,.65+i%2*.18)
        box('dark',0,3.03,-.52,.44,.6,.38);rune(0,3.08,-.31,.065)
        for x in [-.50,.50]:
            rod('wood',(x,.12,1.19),(x+.06,.32,.9),.05)
            skull(x,.24,1.05,.19)
        for x in [-1,1]:
            box('dark',x,2.52,-.225,.39,.33,.075)
            ring('trim',x,2.52,-.176,.14,.03,True)
            rod('hot',(x-.07,2.46,-.138),(x+.055,2.59,-.138),.018,4,True)
            rod('metal',(x,.19,-.96),(x,.19,.20),.09,7)
            valve(x,.59,-.035,.19)
        box('metal',0,.60,.69,.57,.40,.44)
        for x in [-.17,.17]:
            box('dark',x,.66,.926,.11,.19,.03)
            box('glow',x,.72,.949,.055,.065,.025,glow=True)
    elif theme=='emberfall':
        # Carved furnace, worked anvil, hanging piston hammer and riveted ducts.
        box('dark',0,1.76,-.80,3.4,3.34,.66)
        for x in [-1.56,1.56]:
            box('stone',x,1.76,-.79,.26,3.34,.8)
            for y in [.25,.65,2.85,3.31]: box('trim',x,y,-.79,.33,.14,.86)
        box('glow',0,1.8,-.452,2.74,2.76,.026,glow=True)
        for i in range(11): box('metal',-1.20+i*.24,1.8,-.425,.08,2.76,.032)
        for y in [.55,1.05,2.5,3.02]: box('trim',0,y,-.40,2.72,.1,.044)
        box('stone',0,.46,.59,1.32,.92,1.04)
        for x in [-.52,.52]:
            box('trim',x,.48,1.127,.12,.70,.035)
            for y in [.22,.73]: box('metal',x,y,1.15,.08,.08,.034)
        box('metal',0,1.05,.56,1.36,.28,.85)
        box('dark',0,1.31,.56,.62,.30,.62)
        box('metal',0,1.53,.56,1.5,.22,.92)
        for side in [-1,1]:
            mesh('metal',[(side*.75,1.42,.19),(side*.75,1.64,.19),(side*1.32,1.61,.56),(side*.75,1.64,.93),(side*.75,1.42,.93)],[(0,1,2),(1,3,2),(3,4,2),(4,0,2),(0,4,3,1)])
        box('glow',.13,1.67,.53,.70,.09,.19,glow=True)
        box('metal',0,3.46,.56,.27,.55,.27)
        box('dark',0,2.99,.56,.89,.47,.72)
        for x in [-.35,.35]: box('trim',x,3.0,.94,.12,.39,.034)
        for x in [-.70,.70]: chain(x,3.53,.55,1.8)
        box('metal',0,3.44,-.79,3.36,.15,.65)
        for x in [-1.28,-.64,0,.64,1.28]:
            box('trim',x,3.45,-.430,.15,.13,.060)
            box('dark',x,3.12,-.39,.28,.24,.065)
        for side in [-1,1]:
            box('metal',side*1.55,2.03,-.328,.20,1.77,.16)
            for y in [1.22,1.74,2.26,2.79]:box('trim',side*1.55,y,-.225,.25,.14,.065)
        for x in [-.54,.54]:
            box('dark',x,.50,.991,.15,.60,.07)
            box('glow',x,.50,1.039,.057,.48,.022,glow=True)
    else:
        # Miniature spirit pagoda: tiled double roof, ceremonial bell and offering table.
        for x in [-1.15,1.15]:
            box('stone',x,.18,-.3,.39,.36,.51)
            box('wood',x,1.63,-.3,.20,2.8,.22)
            for y in [.40,2.65,2.98]: box('trim',x,y,-.3,.29,.12,.31)
        box('wood',0,2.94,-.3,2.73,.20,.46)
        roof(0,3.05,-.3,3.04,1.38)
        roof(0,3.62,-.3,1.92,.92)
        lathe('trim',0,1.76,-.3,[(0,.55),(.12,.51),(.56,.34),(.74,.23),(.83,.08)],16)
        ring('glow',0,1.79,-.3,.51,.025,glow=True)
        rod('trim',(0,2.55,-.3),(0,2.96,-.3),.07)
        for i in range(10):
            a=i*math.tau/10;box('dark',math.cos(a)*.4,2.03,-.3+math.sin(a)*.4,.07,.18,.06,-a)
        box('wood',0,.75,.76,2.50,.17,.70)
        for x in [-1.0,1.0]:box('wood',x,.38,.76,.18,.75,.47)
        for x in [-.73,.73]:
            lathe('trim',x,.86,.77,[(0,.16),(.10,.1),(.26,.11)],8)
            lathe('hot',x,1.12,.77,[(0,.04),(.16,.08),(.3,.005)],6,True)
        lathe('stone',0,.86,.76,[(0,.2),(.22,.25),(.33,.19)],12)
        for x in [-.08,0,.08]:rod('trim',(x,1.13,.76),(x,1.55,.76),.013)

def portal_plinth():
    # Walkable low relief, with a recessed center left below the runtime vortex.
    lathe('dark',0,0,0,[(0,2.60),(.010,2.80),(.020,2.80)],32)
    for i in range(32):
        a=i*math.tau/32;b=(i+1)*math.tau/32
        vertices=[(math.cos(t)*r,y,math.sin(t)*r) for y in [.02,.12] for r in [2.20,2.72] for t in [a,b]]
        mesh('stone',vertices,[(0,4,5,1),(2,3,7,6),(4,6,7,5),(0,1,3,2),(0,2,6,4),(1,5,7,3)])
        vertices=[(math.cos(t)*r,y,math.sin(t)*r) for y in [.12,.22] for r in [2.32,2.66] for t in [a,b]]
        mesh('trim' if i%4==0 else 'metal',vertices,[(0,4,5,1),(2,3,7,6),(4,6,7,5),(0,1,3,2),(0,2,6,4),(1,5,7,3)])
        if i%2==0:
            box('trim',math.cos(a)*2.53,.220,math.sin(a)*2.53,.20,.014,.12,-a)
            box('dark',math.cos(a)*2.52,.231,math.sin(a)*2.52,.085,.008,.07,-a)
    ring('trim',0,.137,0,2.23,.024)
    ring('portal',0,.141,0,2.14,.016,glow=True)
    for a in [0,math.pi/2,math.pi,math.pi*1.5]:
        for shift in [-.10,.10]: box('trim',math.cos(a)*2.64+math.sin(a)*shift,.165,math.sin(a)*2.64-math.cos(a)*shift,.10,.11,.17,-a)

def bell_shrine():
    # A tiered ceremonial bell dais, fitting the existing 3.8 x 2.9m hero collider.
    for y,w,h,d,tint in [(.10,3.8,.20,2.9,'stone'),(.25,3.54,.10,2.66,'trim'),(.37,3.36,.14,2.46,'light'),(.49,3.05,.10,2.22,'dark')]: box(tint,0,y,0,w,h,d)
    for x in [-1.32,1.32]:
        for y,w,h,tint in [(.70,.61,.32,'stone'),(.91,.52,.10,'trim'),(2.53,.30,3.15,'wood'),(4.09,.50,.13,'trim'),(4.23,.68,.14,'dark')]: box(tint,x,y,-.56,w,h,.46)
        for y in [1.06,1.27,3.55,3.88]: box('trim',x,y,-.56,.39,.10,.53)
        box('accent',x,2.49,-.29,.16,2.15,.07)
    box('wood',0,4.35,-.56,3.43,.22,.69)
    for side in [-1,1]:
        box('trim',side*.82,4.31,-.179,.41,.28,.075)
        box('dark',side*.82,4.31,-.131,.25,.15,.03)
        for y,w,z in [(3.90,.38,-.25),(4.01,.56,-.22),(4.14,.77,-.19)]:box('wood',side*1.22,y,z,w,.12,.10)
        box('trim',side*1.22,4.07,-.121,.42,.052,.044)
    roof(0,4.41,-.56,3.38,1.13)
    lathe('trim',0,1.53,-.49,[(0,.86),(.12,.89),(.22,.78),(.40,.72),(1.33,.51),(1.49,.35),(1.63,.21)],20)
    for y,r in [(1.69,.865),(1.86,.77),(2.77,.56),(3.02,.36)]: ring('trim',0,y,-.49,r,.045)
    for i in range(12):
        a=i*math.tau/12;box('dark',math.cos(a)*.615,2.35,-.49+math.sin(a)*.615,.10,.49,.035,-a)
        for y in [2.06,2.61]: lathe('trim',math.cos(a)*.65,y,-.49+math.sin(a)*.65,[(0,.045),(.06,.045)],5)
    lathe('trim',0,3.16,-.49,[(0,.16),(.11,.27),(.21,.16),(.30,.12)],10)
    ring('trim',0,3.63,-.49,.23,.045,True)
    rod('metal',(0,3.86,-.49),(0,4.32,-.49),.075)
    lathe('dark',0,1.28,-.49,[(0,.12),(.30,.16)],8)
    for x in [-1.16,1.16]:
        box('stone',x,.75,.90,.46,.42,.48);box('trim',x,1.00,.90,.51,.10,.53)
        box('hot',x,1.22,.90,.30,.36,.30,glow=True)
        for dx in [-.18,.18]:
            for dz in [-.18,.18]: box('wood',x+dx,1.22,.90+dz,.055,.45,.055)
        box('trim',x,1.46,.90,.50,.08,.52)
    box('wood',0,.86,.95,1.35,.16,.56)
    for x in [-.50,.50]: box('wood',x,.68,.95,.14,.32,.37)
    rune(0,.85,1.244,.09,'trim',2)

def library():
    for name,fn in [('wall',lambda:wall()),('alcove',lambda:wall(True)),('pillar',lambda:pillar()),('guardian',lambda:pillar(True)),('arch',arch),('brazier',lantern),('pool',pool),('gate',gate),('chest',chest),('seal',marker),('checkpoint',lambda:marker(True)),('mushrooms',mushrooms),('landmark',landmark)]: prop(name);fn()
    if theme=='veilhaven':
        prop('portal-plinth');portal_plinth()
        prop('bell-shrine');bell_shrine()
def aim(obj,at): obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
def run(kind):
    global parts,palette,theme,override
    theme=kind;parts={};override=None;palette={k:color(v) for k,v in THEMES[kind].items()}
    bpy.ops.wm.read_factory_settings(use_empty=True); library();scene=bpy.context.scene;scene.name=f'{kind} authored kit';scene.unit_settings.system='METRIC'
    mats={}
    for role in ['stone','glow','water']:
        m=bpy.data.materials.new(f'{kind}-{role}');m.use_nodes=True;bsdf=m.node_tree.nodes.get('Principled BSDF');v=m.node_tree.nodes.new('ShaderNodeVertexColor');v.layer_name='Color';m.node_tree.links.new(v.outputs['Color'],bsdf.inputs['Base Color']);bsdf.inputs['Roughness'].default_value=.74 if role=='stone' else .22;bsdf.inputs['Metallic'].default_value=.16
        if role in ['glow','water']:
            m.node_tree.links.new(v.outputs['Color'],bsdf.inputs['Emission Color']);bsdf.inputs['Emission Strength'].default_value=2 if role=='glow' else .55
        mats[role]=m
    # Normalize decorative wall relief to the authoritative 1.2m depth envelope.
    for name in ['wall','alcove']:
        depth=max(abs(v[1]) for data in parts[name].values() for v in data['vertices']);width=max(abs(v[0]) for data in parts[name].values() for v in data['vertices'])
        for data in parts[name].values(): data['vertices']=[(v[0]*min(1,2/width),v[1]*.599/depth,v[2]) for v in data['vertices']]
    roots=[]; triangles=0
    for name,roles in parts.items():
        parent=bpy.data.objects.new(f'{kind}-{name}',None);scene.collection.objects.link(parent);roots.append(parent);parent['asset']=name;parent['collision_contract']='Runtime dungeon layout owns collision. Exact pivots and metric bounds.'
        for role,data in roles.items():
            mesh=bpy.data.meshes.new(f'{kind}-{name}-{role}');mesh.from_pydata(data['vertices'],[],data['faces']);mesh.update();colors=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
            for face,rgba in zip(mesh.polygons,data['colors']):
                for index in face.loop_indices: colors.data[index].color=rgba
            mesh.materials.append(mats[role if role in mats else 'stone']);obj=bpy.data.objects.new(f'{name}-{role}',mesh);scene.collection.objects.link(obj);obj.parent=parent
            mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles)
    output=ROOT/f'public/models/{kind}-kit.glb';source=ROOT/f'assets/source/{kind}-kit.blend';preview=ROOT/f'assets/source/{kind}-kit-preview.png'
    source.parent.mkdir(parents=True,exist_ok=True);output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    outputs=[output]
    if kind=='veilhaven' and '--preserve-shared' not in sys.argv:
        shared=next(parent for parent in roots if parent['asset']=='portal-plinth')
        shared.name='dungeon-room-portal-plinth';bpy.ops.object.select_all(action='DESELECT')
        for obj in [shared,*shared.children]: obj.select_set(True)
        shared_output=ROOT/'public/models/dungeon-room-kit.glb'
        bpy.ops.export_scene.gltf(filepath=str(shared_output),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
        shared.name='veilhaven-portal-plinth';shared['shared_runtime_root']='dungeon-room-portal-plinth';outputs.append(shared_output)
    if '--optimize' in sys.argv:
        for exported in outputs:
            with tempfile.TemporaryDirectory(prefix=kind+'-') as tmp:
                last=exported
                for i,cmd in enumerate(['weld','dedup','prune']):
                    dest=Path(tmp)/f'{i}.glb' if i<2 else exported;subprocess.run(['npx','--yes','--prefer-offline','@gltf-transform/cli@4.5.0',cmd,str(last),str(dest)],check=True);last=dest
                packed=Path(tmp)/'quantized.glb';subprocess.run(['npx','--yes','--prefer-offline','@gltf-transform/cli@4.5.0','quantize',str(exported),str(packed),'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],check=True);exported.write_bytes(packed.read_bytes())
    gallery=bpy.data.scenes.new(kind+' playable architecture study');bpy.context.window.scene=gallery
    def place(name,x,z,turn=0,scale=(1,1,1)):
        src=next(p for p in roots if p['asset']==name);p=src.copy();gallery.collection.objects.link(p);p.location=xyz(x,0,z);p.rotation_euler.z=-turn;p.scale=(scale[0],scale[2],scale[1])
        for child in src.children: obj=child.copy();obj.data=child.data;gallery.collection.objects.link(obj);obj.parent=p
    for side in [-1,1]:
        for i in range(4): place('alcove' if i%2 else 'wall',side*10,-6+i*4,math.pi/2)
        if kind!='veilhaven':
            for i in range(2): place('wall',side*(6+i*4),-8)
        place('guardian',side*(8 if kind=='veilhaven' else 6),-2,scale=(1.15,1.3,1.15));place('brazier',side*3,-4);place('chest',side*7,4)
    if kind=='veilhaven':
        for i,x in enumerate([-8,-4,0,4,8]): place('alcove' if i%2 else 'wall',x,-8)
        place('bell-shrine',0,-5);place('portal-plinth',0,5)
        for x in [-5.7,5.7]:place('portal-plinth',x,-4.5)
        for side in [-1,1]:
            for z in [-5,3,6]:place('brazier',side*8.5,z)
        place('seal',0,0)
    else:
        place('arch',0,-8);place('pool',-5,3,scale=(1.25,1,1.25));place('landmark',-5,3,scale=(1.25,1,1.25));place('checkpoint',4,2);place('mushrooms',-8,5);place('seal',0,-1)
    # Tile geometry and visible dark grout, with a genuine pool recess.
    for x in range(-9,11,2):
        for z in range(-7,9,2):
            if kind!='veilhaven' and abs(x+5)<2.5 and abs(z-3)<2: continue
            bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(x,-.11,z));o=bpy.context.object;o.name='Preview floor tile';o.scale=(1.97,1.97,.22)
            tile=(x//2+z//2)%2 if kind=='veilhaven' else 0
            fm=bpy.data.materials.get(f'gallery-floor-{tile}')
            if not fm:
                fm=bpy.data.materials.new(f'gallery-floor-{tile}');fm.use_nodes=True;fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=color(['362C2A','704C37'][tile]) if kind=='veilhaven' else palette['stone'];fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85
            o.data.materials.append(fm)
    bpy.ops.object.camera_add(location=xyz(10 if kind=='veilhaven' else 20,21 if kind=='veilhaven' else 19,28));cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=27 if kind=='veilhaven' else 29;aim(cam,(0,1.6,-.3));gallery.camera=cam
    for pos,power,size in [((-7,14,7),2400,10),((8,9,-3),1700,8)]:
        bpy.ops.object.light_add(type='AREA',location=xyz(*pos));lamp=bpy.context.object;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size;aim(lamp,(0,1,0))
    bpy.ops.object.light_add(type='SUN',location=xyz(-7,12,9));sun=bpy.context.object;sun.data.energy=1.5;sun.data.angle=.18;aim(sun,(0,0,0))
    for x,z in [(-3,-4),(3,-4)]:
        bpy.ops.object.light_add(type='POINT',location=xyz(x,2.8,z));lamp=bpy.context.object;lamp.data.color=tuple(int(THEMES[kind]['hot' if kind=='veilhaven' else 'glow'][i:i+2],16)/255 for i in (0,2,4));lamp.data.energy=110 if kind=='veilhaven' else 75;lamp.data.shadow_soft_size=1
    gallery.world=bpy.data.worlds.new(kind+' atmosphere');gallery.world.use_nodes=True;gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.065,.09,.10,1);gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35
    gallery.render.engine='CYCLES';gallery.cycles.samples=24;gallery.cycles.use_denoising=True;gallery.render.resolution_x=1600;gallery.render.resolution_y=1200;gallery.render.resolution_percentage=100;gallery.render.filepath=str(preview);gallery.view_settings.view_transform='AgX'
    gallery['authoring']='Original authored geometry. Reference-inspired theme; no copied art, image planes or runtime light payloads.'
    if kind=='veilhaven':
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type=='VIEW_3D':
                    area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL';area.spaces.active.shading.use_scene_lights=True;area.spaces.active.shading.use_scene_world=True
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
    assert triangles<50000 and output.stat().st_size<3000000
    print('THEMED_DUNGEON '+json.dumps({'theme':kind,'props':len(roots),'triangles':triangles,'bytes':output.stat().st_size}))
    if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
for kind in THEMES:
    if any(arg.startswith('--only=') for arg in sys.argv) and '--only='+kind not in sys.argv:continue
    run(kind)
