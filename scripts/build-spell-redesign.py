"""Author the redesign spell kit and render its icons in Blender.

Blender --background --python scripts/build-spell-redesign.py -- --render
Seven runtime groups, thirteen icon sculptures, and editable keyed motion studies.
Geometry uses the game's existing vertex-colour mesh tools; no external textures.
"""
import bpy
import math
import json
import sys
import subprocess
import tempfile
import numpy as np
from pathlib import Path
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import spell_model_tools as m

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/source/spell-redesign'
ICONS = ROOT / 'public/ui/spell-redesign'
OUT.mkdir(parents=True, exist_ok=True)
ICONS.mkdir(parents=True, exist_ok=True)

def pack_icons():
    ids=['roll','blink','lighspeed','poison-cloud','edict-of-the-dawn','titans-edict','eternal-edict','edict-of-light','bouncing-edicts','edict-of-protection','blanket-edicts','edict-of-harm','renewable-edict']
    pixels=np.zeros((1024,1024,4),dtype=np.float32)
    for i,id in enumerate(ids):
        img=bpy.data.images.load(str(OUT/'icons'/(id+'.png')),check_existing=False)
        img.scale(256,256)
        name='lightspeed' if id=='lighspeed' else id
        img.filepath_raw=str(ICONS/(name+'.png'));img.file_format='PNG';img.save()
        x=i%4*256;y=(3-i//4)*256
        pixels[y:y+256,x:x+256]=np.array(img.pixels[:],dtype=np.float32).reshape((256,256,4))
        bpy.data.images.remove(img)
    atlas=bpy.data.images.new('Spell redesign atlas | 4 by 4',width=1024,height=1024,alpha=True)
    atlas.pixels.foreach_set(pixels.ravel())
    atlas.filepath_raw=str(ROOT/'public/ui/spells-redesign.png');atlas.file_format='PNG';atlas.save()
    bpy.data.images.remove(atlas)

if '--pack' in sys.argv:
    pack_icons()
    sys.exit(0)
m.reset()
scene = bpy.context.scene
scene.name = 'Mossvale | Class spell atelier'
scene.unit_settings.system = 'METRIC'
scene.render.fps = 30
scene.frame_start = 1
scene.frame_end = 60
scene.timeline_markers.new('Gather', frame=1)
scene.timeline_markers.new('Unfold', frame=18)
scene.timeline_markers.new('Crest', frame=32)
scene.timeline_markers.new('Release', frame=48)
scene.timeline_markers.new('Dissolve', frame=60)

def c(value): return m.forest_color(value)
GOLD=c('d99a3c'); EDGE=c('ffdda0'); IVORY=c('e9e6cf'); TEAL=c('196668')
JADE=c('479377'); LEAF=c('96c66b'); BARK=c('66452d'); LEATHER=c('875736')
VIOLET=c('6656b1'); LILAC=c('c2a0fa'); CYAN=c('79d3dc'); DARK=c('202b39')
POISON=c('a3ce48'); PURPLE=c('704688'); ROSE=c('f28c70'); WHITE=c('fff5d6')
roots=[]
current=None

def begin(id):
    global current
    current=bpy.data.objects.new('Spell_'+id.replace('-','_'), None)
    scene.collection.objects.link(current)
    current['ability']=id
    current['axes']='Y up after glTF export; +Z forward; grounded origin'
    roots.append(current)

def finish(role):
    obj=m.finish(current['ability']+'_'+role)
    obj.name=current.name+'_'+role
    obj.parent=current
    return obj

def curve(points,r=.025,color=GOLD,sides=6):m.tube(points,r,color,sides)
def jewel(p,size=.1,color=CYAN):
    x,y,z=p;m.crystal((x,y-size,z),(x,y+size,z),size*.65,color,6)
def sphere(p,r,color):m.ellipsoid(p,(r,r,r),color,10,6)

def arc(center,r,a,b,width,color=GOLD,plane='z',steps=28):
    x,y,z=center
    points=[]
    for i in range(steps+1):
        t=a+(b-a)*i/steps
        points.append((x+r*math.cos(t),y+r*math.sin(t),z) if plane=='z' else (x+r*math.cos(t),y,z+r*math.sin(t)))
    curve(points,[width*(.35+.65*math.sin(math.pi*i/steps)**.5) for i in range(steps+1)],color)

def rays(center,r,outer,count=12,color=GOLD):
    x,y,z=center
    for i in range(count):
        a=math.tau*i/count
        m.crystal((x+math.cos(a)*r,y+math.sin(a)*r,z),
                  (x+math.cos(a)*(outer if i%2==0 else outer*.88),y+math.sin(a)*(outer if i%2==0 else outer*.88),z),.04,color,4)

def feather(a,b,width,color=IVORY):
    a,b=Vector(a),Vector(b);d=b-a;side=d.cross(Vector((0,0,1))).normalized()
    for i in range(7):
        p=a+d*(i+.5)/7
        w=width*math.sin(math.pi*(i+.5)/7)**.7
        m.plate([p-side*w-d/15,p+side*w-d/15,p+side*w*.82+d/15,p-side*w*.82+d/15],.035,m.tint(color,.85+.15*i/7))
    curve([a,a.lerp(b,.5)+Vector((0,0,.025)),b],[.013,.012,.002],EDGE,4)

def wings(y=1.05,width=1,color=IVORY):
    for side in [-1,1]:
        for i in range(6):
            feather((side*.23,y+i*.065,.04),(side*(.55+width*.095*i),y+.6-i*.13,.04),.09-i*.006,color)

def seal(x,y,z,size=.4,color=TEAL):
    m.ellipsoid((x,y,z),(size,size,.09),GOLD,16,5)
    m.ellipsoid((x,y,z+.05),(size*.79,size*.79,.07),color,16,5)
    m.ring((x,y,z+.11),size*.75,.018,EDGE,'z',24)
    for i in range(8):
        a=i*math.tau/8
        jewel((x+math.cos(a)*size*.91,y+math.sin(a)*size*.91,z+.02),size*.06,IVORY)

def heart(center,size=.35,color=IVORY):
    x,y,z=center
    outline=[(0,-.9),(-.75,-.2),(-.85,.38),(-.55,.7),(-.2,.65),(0,.38),(.2,.65),(.55,.7),(.85,.38),(.75,-.2)]
    m.plate([(x+a*size,y+b*size,z) for a,b in outline],.15,GOLD)
    m.plate([(x+a*size*.83,y+b*size*.82,z+.085) for a,b in outline],.09,color)
    jewel((x-.12*size,y+.22*size,z+.15),size*.14,WHITE)

def shield(center=(0,1,0),size=1,ornate=True):
    x,y,z=center
    outline=[(0,-.95),(-.57,-.43),(-.7,.44),(-.44,.73),(0,.64),(.44,.73),(.7,.44),(.57,-.43)]
    for k,depth,front,color in [(1,.14,0,GOLD),(.85,.08,.11,TEAL),(.66,.03,.17,JADE)]:
        m.plate([(x+a*size*k,y+b*size*k,z+front) for a,b in outline],depth,color)
    curve([(x-.46*size,y+.53*size,z+.2),(x,y-.73*size,z+.21),(x+.46*size,y+.53*size,z+.2)],.028,EDGE)
    jewel((x,y+.12*size,z+.26),.24*size,CYAN)
    if ornate:
        for side in [-1,1]:
            for i in range(3):
                feather((x+side*.16*size,y-.06*size,z+.22),(x+side*(.39-i*.03)*size,y+(.34-i*.25)*size,z+.22),.055*size,IVORY)
        for a,b in outline[1:]:sphere((x+a*size*.93,y+b*size*.93,z+.1),.035*size,EDGE)

def book():
    for side in [-1,1]:
        m.box((side*.37,.58,0),(.72,.13,.9),TEAL)
        m.box((side*.37,.67,0),(.66,.12,.81),IVORY)
        for i in range(6):
            z=-.31+i*.125
            curve([(side*.06,.78,z),(side*.31,.75,z),(side*.65,.72,z)],.009,GOLD,4)
        for z in [-.4,.4]:m.box((side*.4,.59,z),(.65,.06,.035),GOLD)
    curve([(0,.7,-.5),(0,.72,0),(0,.7,.5)],.06,GOLD)
    for side in [-1,1]:
        for i in range(5):
            curve([(side*.08,.72+i*.014,-.39),(side*.34,.76+i*.014,-.39),(side*.68,.68+i*.014,-.39)],.006,EDGE,4)

def hourglass(x=0,y=1.0,z=0,size=1):
    for h in [-.56,.56]:
        m.lathe((x,y+h*size,z),[(.34*size,0),(.4*size,.04*size),(.38*size,.09*size)],GOLD,20)
    # Faceted teal glass walls, an ivory stream, and layered piles of golden sand.
    for side in [-1,1]:
        m.lathe((x,y,z),[(.06*size,0),(.27*size,.31*side*size),(.29*size,.49*side*size)],CYAN,12)
    m.lathe((x,y-.5*size,z),[(.24*size,0),(.18*size,.11*size),(0,.22*size)],EDGE,16)
    curve([(x,y+.2*size,z+.08*size),(x,y-.31*size,z+.08*size)],.018*size,WHITE,5)
    for a in [0,math.pi/2,math.pi,3*math.pi/2]:
        xx=x+math.cos(a)*.36*size;zz=z+math.sin(a)*.36*size
        curve([(xx,y-.49*size,zz),(xx,y+.54*size,zz)],.028*size,GOLD)
        for h in [-.47,.46]:sphere((xx,y+h*size,zz),.05*size,EDGE)

def motes(color=EDGE,count=14,top=2.0):
    for i in range(count):
        a=i*2.399;r=.63+(i%3)*.13;y=.32+(i/count)*(top-.32)
        jewel((math.cos(a)*r,y,math.sin(a)*r),.035+(i%3)*.012,color)

def boot(color=LEATHER):
    m.box((-.08,.4,.03),(.49,.46,.52),color)
    m.ellipsoid((.2,.21,.12),(.47,.2,.34),color,12,6)
    m.box((.16,.08,.08),(.9,.09,.57),DARK)
    for y in [.36,.55]:
        m.box((-.08,y,.315),(.5,.065,.05),GOLD)
        m.box((.04,y,.35),(.13,.1,.045),EDGE)
        m.box((.04,y,.378),(.07,.053,.012),DARK)
    for i in range(7):
        sphere((-.25+i*.115,.145,.37),.012,IVORY)
    m.box((-.08,.66,.03),(.54,.085,.56),JADE)
    feather((-.26,.63,.36),(-.37,1.06,.36),.1,LEAF)

# ROLL: leather boot, a coiling carved fern and separate feather wake.
begin('roll');boot();finish('core')
arc((0,.8,0),.89,.15,math.tau-.25,.046,JADE)
for i in range(12):
    a=.15+i*.42
    feather((math.cos(a)*.84,.8+math.sin(a)*.84,0),(math.cos(a+.24)*1.04,.8+math.sin(a+.24)*1.04,0),.08,LEAF)
finish('ring')
for i in range(3):
    feather((-.6+i*.13,.18+i*.12,.24),(-1.1,.22+i*.27,-.6-i*.15),.1,IVORY)
finish('ribbon');motes(LEAF,9,1.4);finish('shard')

# BLINK: a split octagonal gateway, an inner crystal and broken runic satellites.
begin('blink')
m.crystal((0,.45,0),(0,1.7,0),.28,VIOLET,8)
m.crystal((0,.74,.22),(0,1.46,.22),.12,CYAN,6);finish('core')
for side in [-1,1]:
    points=[(side*.35,.15,0),(side*.83,.48,0),(side*.94,1.25,0),(side*.58,1.99,0),(side*.2,2.11,0)]
    curve(points,.075,GOLD,8);curve([(x,y,z+.04) for x,y,z in points],.03,LILAC,6)
    for x,y,z in points[1:-1]:jewel((x,y,z+.03),.11,CYAN)
finish('ring')
arc((0,1.13,-.12),.65,.2,2.8,.035,LILAC);arc((0,1.13,-.12),.65,3.4,6,.035,CYAN);finish('orbit')
for i in range(10):
    a=i*math.tau/10;x=math.cos(a)*1.02;y=1.12+math.sin(a)*1.02
    curve([(x-.04,y-.06,.05),(x+.04,y,.05),(x-.04,y+.06,.05)],.012,IVORY,4)
finish('rune');motes(LILAC,12,2.2);finish('shard')

# LIGHTSPEED: a gilt sandal, individually carved wings and a descending light bolt.
begin('lighspeed');boot(GOLD);finish('core')
wings(.62,1.4);finish('wing')
curve([(.45,1.85,.15),(-.05,1.2,.15),(.31,1.22,.15),(-.22,.56,.15)],[.09,.075,.075,0],EDGE,4);finish('rune')
for i in range(3):arc((0,.73,-.14-i*.1),.86+i*.12,2.9,5.5,.027,EDGE);finish('ribbon') if i==2 else None
motes(WHITE,12,1.9);finish('shard')

# POISON CLOUD: veined mushrooms, puffing spores and curling living roots.
begin('poison-cloud')
for x,y,z,r in [(-.32,.8,.06,.42),(.26,1.2,-.08,.5),(.63,.53,.3,.28),(-.64,.43,.2,.23)]:
    curve([(x,.12,z),(x-.07,y*.6,z),(x,y,z)],[r*.15,r*.19,r*.12],IVORY,8)
    m.lathe((x,y,z),[(r*.18,-r*.1),(r*.8,-r*.06),(r,0),(r*.88,r*.18),(r*.47,r*.4),(0,r*.47)],PURPLE,16)
    for i in range(12):
        a=i*math.tau/12
        curve([(x,y-r*.07,z),(x+math.cos(a)*r*.88,y-r*.01,z+math.sin(a)*r*.88)],.009,POISON,4)
    for i in range(7):
        a=i*2.399;rr=r*(.25+i%2*.23)
        sphere((x+math.cos(a)*rr,y+r*.35,z+math.sin(a)*rr),r*.058,POISON)
finish('core')
for i in range(7):
    a=i*math.tau/7
    curve([(0,.08,0),(math.cos(a)*.48,.09,math.sin(a)*.48),(math.cos(a+.3)*.94,.12,math.sin(a+.3)*.94)],[.07,.045,.005],BARK,6)
    m.leaf((math.cos(a)*.5,.15,math.sin(a)*.5),(math.cos(a)*1.05,.2,math.sin(a)*1.05),.1,JADE)
finish('ring')
for i in range(3):
    curve([(math.cos(i*2)*(.3+j*.015),.7+j*.09,math.sin(i*2+j*.17)*.48) for j in range(13)],[.035]*(13),POISON)
finish('ribbon');motes(POISON,18,2);finish('shard')

# DAWN: a many-layered illuminated tome opens under a rising sun.
begin('edict-of-the-dawn');book();finish('core')
seal(0,1.39,0,.34,GOLD);rays((0,1.39,.01),.4,.71,14,EDGE);finish('ring')
for side in [-1,1]:
    for i in range(4):feather((side*.23,.6,.04),(side*(.52+i*.16),1.23-i*.13,.04),.09,IVORY)
finish('wing')
for i in range(3):arc((0,.34+i*.11,0),.6+i*.16,0,math.tau-.3,.022,TEAL,'y');finish('orbit') if i==2 else None
motes(EDGE,12,2);finish('shard')

# TITAN: a substantial layered ward with rivets, relief carving and floating plates.
begin('titans-edict');shield((0,1.03,0),1);finish('core')
for side in [-1,1]:
    m.plate([(side*.72,.65,0),(side*1.05,.86,-.04),(side*1.04,1.45,-.04),(side*.77,1.65,0)],.11,GOLD)
    m.plate([(side*.78,.79,.07),(side*.95,.9,.04),(side*.95,1.37,.04),(side*.79,1.48,.07)],.025,IVORY)
finish('wing')
arc((0,1.08,-.16),1.04,0,math.tau,.027,CYAN);finish('ring')
for i in range(8):
    a=i*math.tau/8;x=math.cos(a)*1.1;y=1.08+math.sin(a)*1.1
    jewel((x,y,-.1),.065,EDGE)
finish('rune');motes(CYAN,10,2);finish('shard')

# ETERNAL: a bronze hourglass wrapped by a luminous infinity knot.
begin('eternal-edict');hourglass();finish('core')
points=[(math.sin(i*math.tau/80)*.93,1+math.sin(i*math.tau/40)*.38,math.cos(i*math.tau/80)*.22) for i in range(81)]
curve(points,.037,GOLD);finish('ring')
for y in [.34,1.71]:
    arc((0,y,0),.62,0,math.tau,.025,LILAC,'y')
finish('orbit')
for side in [-1,1]:
    feather((side*.33,.92,-.07),(side*.78,1.55,-.07),.12,IVORY)
finish('wing');motes(EDGE,14,2.1);finish('shard')

# Passive talent icons: the shared vocabulary communicates their actual behavior.
begin('edict-of-light');heart((0,1,.1),.5);finish('core')
rays((0,1,0),.61,.94,12,EDGE);arc((0,1,-.04),.74,0,math.tau,.023,GOLD);finish('ring')
wings(.63,.8);finish('wing')

begin('bouncing-edicts')
for x,y,s in [(-.65,.56,.29),(0,1.48,.38),(.69,.58,.29)]:heart((x,y,.1),s)
finish('core')
curve([(-.62,.85,0),(-.43,1.32,0),(-.18,1.45,0)],.035,EDGE)
curve([(.27,1.48,0),(.51,1.22,0),(.64,.88,0)],.035,EDGE)
for x,y in [(-.18,1.45),(.64,.88)]:m.crystal((x-.05,y+.06,0),(x+.09,y-.09,0),.08,GOLD,4)
finish('ribbon')

begin('edict-of-protection');shield((0,1,0),.85,False);finish('core')
for side in [-1,1]:
    curve([(side*.72,.4,.08),(side*.9,1.1,.08),(side*.53,1.87,.08)],.04,EDGE)
    m.crystal((side*.63,1.58,.08),(side*.46,1.96,.08),.085,IVORY,4)
finish('ring');rays((0,1.14,-.1),.72,.9,8,CYAN);finish('rune')

begin('blanket-edicts')
for x,y,s in [(-.59,.7,.29),(0,1.03,.36),(.59,.7,.29)]:
    seal(x,y,0,s);jewel((x,y,.15),s*.5,IVORY)
finish('core')
arc((0,1.02,-.1),.91,0,math.pi,.06,GOLD)
for x in [-.64,0,.64]:curve([(x,1.38,0),(x,.36,0)],[.026,.008],CYAN)
finish('ring');motes(EDGE,8,1.7);finish('shard')

begin('edict-of-harm')
m.plate([(-.11,.46,0),(-.14,1.33,0),(0,1.67,0),(.14,1.33,0),(.11,.46,0),(0,.16,0)],.13,IVORY)
curve([(-.36,1.39,.07),(0,1.33,.07),(.36,1.39,.07)],.07,GOLD)
curve([(0,1.51,0),(0,1.88,0)],.065,TEAL);jewel((0,1.89,0),.13,ROSE);finish('core')
for side in [-1,1]:
    m.flame((side*.37,.89,-.06),(.34,1.05,.3),ROSE,-side*.6)
finish('wing');rays((0,1.08,-.2),.59,.91,8,GOLD);finish('ring')

begin('renewable-edict');heart((0,1,.08),.38,JADE)
for side in [-1,1]:feather((0,.83,.12),(side*.33,1.25,.12),.1,LEAF)
finish('core')
for a in [.2,math.pi+.2]:
    arc((0,1,0),.78,a,a+2.5,.055,GOLD)
    x=math.cos(a+2.5)*.78;y=1+math.sin(a+2.5)*.78
    m.crystal((x,y,0),(x-math.sin(a+2.5)*.3,y+math.cos(a+2.5)*.3,0),.105,EDGE,4)
finish('ring');motes(LEAF,10,1.9);finish('shard')

# One vertex-colour surface keeps exported draw calls bounded and is also editable.
mat=bpy.data.materials['Spell radiant surface']
mat.name='Carved enamel, ivory and antique gilt | vertex palette'
shader=mat.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value=.36
shader.inputs['Metallic'].default_value=.32
shader.inputs['Emission Strength'].default_value=.13

runtime=roots[:7]
bpy.ops.object.select_all(action='DESELECT')
for root in runtime:
    root.select_set(True)
    for obj in root.children:obj.select_set(True)
bpy.context.view_layer.objects.active=runtime[0]
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/spell-redesign.glb'),export_format='GLB',use_selection=True,
    export_animations=False,export_yup=True,export_texcoords=False,export_normals=True,export_cameras=False,export_lights=False)
with tempfile.TemporaryDirectory(prefix='mossvale-spells-') as tmp:
    last=ROOT/'public/models/spell-redesign.glb'
    for index,operation in enumerate(['dedup','prune']):
        dest=Path(tmp)/f'{index}.glb'
        subprocess.run(['npx','--yes','--prefer-offline','@gltf-transform/cli@4.5.0',operation,str(last),str(dest)],check=True)
        last=dest
    dest=Path(tmp)/'packed.glb'
    subprocess.run(['npx','--yes','--prefer-offline','@gltf-transform/cli@4.5.0','quantize',str(last),str(dest),'--pattern','{NORMAL,COLOR_*}','--quantize-normal','8','--quantize-color','8'],check=True)
    (ROOT/'public/models/spell-redesign.glb').write_bytes(dest.read_bytes())

# Motion studies are retained in the .blend; the game's instanced renderer animates
# the same named parts at authoritative combat phase timings, without per-cast mixers.
for root in runtime:
    for obj in root.children:
        role=obj.name.rsplit('_',1)[-1]
        for frame in [1,12,24,36,48,60]:
            p=(frame-1)/59
            envelope=max(.025,math.sin(math.pi*p)**.5)
            obj.scale=(envelope,)*3
            obj.rotation_euler=(0,0,0)
            obj.location=(0,0,0)
            if role in ['ring','orbit','rune']:obj.rotation_euler[2]=p*math.tau*(.22 if role=='ring' else -.4)
            if role=='wing':obj.rotation_euler[1]=math.sin(p*math.pi)*.16
            if role in ['shard','ribbon']:obj.location.z=math.sin(p*math.pi)*.16
            obj.keyframe_insert(data_path='scale',frame=frame)
            obj.keyframe_insert(data_path='rotation_euler',frame=frame)
            obj.keyframe_insert(data_path='location',frame=frame)
        if obj.animation_data and obj.animation_data.action:obj.animation_data.action.name=obj.name+' | gather unfold release'
scene.frame_set(30)

world=bpy.data.worlds.new('Atelier ambient');world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.22,.3,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.55
scene.world=world
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=scene.render.resolution_y=512
scene.render.resolution_percentage=100;scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='Icon portrait camera';camera.data.type='ORTHO';scene.camera=camera
lights=[]
for name,pos,power,color,size in [('Warm key',(-3,-4,5),650,(1,.84,.62),4),('Cool fill',(3,-1,2),400,(.58,.78,1),3),('Gold rim',(0,3,4),800,(1,.76,.42),2)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=pos
    obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler();lights.append(obj)

stats={}
for root in roots:
    meshes=list(root.children)
    stats[root['ability']]={'parts':len(meshes),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)}
    for o in meshes:
        # Icon portraits are the crest pose, free from animation scale/twist.
        o.animation_data_clear() if root not in runtime else None

if '--render' in sys.argv:
    # Temporarily disable animation evaluation; render clean, designed silhouettes.
    actions={o:o.animation_data.action for root in runtime for o in root.children if o.animation_data}
    for o in actions:o.animation_data.action=None;o.scale=(1,1,1);o.location=(0,0,0);o.rotation_euler=(0,0,0)
    for root in roots:
        for other in roots:
            for o in other.children:o.hide_render=other!=root
        bpy.context.view_layer.update()
        corners=[o.matrix_world@Vector(v) for o in root.children for v in o.bound_box]
        lo=Vector(tuple(min(p[i] for p in corners) for i in range(3)));hi=Vector(tuple(max(p[i] for p in corners) for i in range(3)))
        center=(lo+hi)/2
        camera.location=center+Vector((.5,-6,2.0))
        camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.ortho_scale=max(hi-lo)*1.27
        (OUT/'icons').mkdir(exist_ok=True)
        scene.render.filepath=str(OUT/'icons'/(root['ability']+'.png'))
        bpy.ops.render.render(write_still=True)
        print('ICON',root['ability'],flush=True)
    for o,action in actions.items():o.animation_data.action=action
    scene.frame_set(30)
    pack_icons()

# Arrange a readable source library without baking layout offsets into runtime GLB.
for i,root in enumerate(roots):
    root.location=((i%4)*3.2,(i//4)*3.3,0)
    for o in root.children:o.hide_render=False
camera.location=(6,-13,16)
camera.rotation_euler=(Vector((5,4,1))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=17
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=20
        area.spaces.active.region_3d.view_location=(5,4,1)
        area.spaces.active.shading.type='MATERIAL'
scene['README']='13 original sculptures; first 7 runtime groups. Play frames 1–60 for motion studies. Icon cameras use lit Cycles; game uses baked vertex colours and named-part animation.'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'spell-redesign.blend'))
(OUT/'manifest.json').write_text(json.dumps({'runtime':'public/models/spell-redesign.glb','icons':list(stats),'models':stats,'animationFrames':60,'fps':30},indent=2)+'\n')
print('DONE',json.dumps(stats),flush=True)
