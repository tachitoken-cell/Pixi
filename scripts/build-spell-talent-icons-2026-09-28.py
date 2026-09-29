"""Blender --background --python scripts/build-spell-talent-icons-2026-09-28.py

Twenty requested icons, with an editable source library and a separate 4x5 atlas.
Uses the existing native spell mesh tools; earlier atlases remain unchanged.
"""
import bpy, math, json, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).parent))
import spell_model_tools as m

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/source/spell-talents-2026-09-28'
ICONS = ROOT / 'public/ui/spell-talents-2026-09-28'
OUT.mkdir(parents=True, exist_ok=True); ICONS.mkdir(parents=True, exist_ok=True)
m.reset()
GOLD=m.forest_color('dba542'); LIGHT=m.forest_color('fff0ba'); DARK=m.forest_color('243647')
GREEN=m.forest_color('74b874'); TEAL=m.forest_color('397d81'); ICE=m.forest_color('a5e5f1')
VIOLET=m.forest_color('a380d9'); FIRE=m.forest_color('f48a42'); BARK=m.forest_color('67482e')
names=[]

def stroke(points, width=.035, color=GOLD): m.tube(points,width,color,6)
def dot(x,y,size=.08,color=LIGHT): m.ellipsoid((x,y,.16),(size,size,.09),color,10,5)
def finish(name):
    obj=m.finish_forest(name);obj['icon']=name;names.append(name);return obj
def arrow(x=0,y=0,angle=0,color=LIGHT):
    def p(a,b): return (x+a*math.cos(angle)-b*math.sin(angle),y+a*math.sin(angle)+b*math.cos(angle),.12)
    stroke([p(0,-.7),p(0,.5)],.045,BARK)
    m.plate([p(-.18,.35),p(0,.84),p(.18,.35)],.09,color)
    for side in [-1,1]: m.leaf(p(0,-.42),p(side*.22,-.67),.08,GREEN)
def sword(x=0,y=0,angle=0,color=ICE):
    def p(a,b): return (x+a*math.cos(angle)-b*math.sin(angle),y+a*math.sin(angle)+b*math.cos(angle),.1)
    m.plate([p(-.11,-.3),p(-.15,.58),p(0,.88),p(.15,.58),p(.11,-.3)],.11,color)
    stroke([p(-.32,-.3),p(.32,-.3)],.065,GOLD);stroke([p(0,-.32),p(0,-.72)],.07,BARK);m.ellipsoid(p(0,-.76),(.12,.12,.12),GOLD)
def shield(x=0,y=0,size=1,color=TEAL):
    outline=[(0,-.83),(-.6,-.15),(-.62,.52),(0,.72),(.62,.52),(.6,-.15)]
    for scale,depth,c in [(1,0,GOLD),(.82,.1,color)]:m.plate([(x+a*size*scale,y+b*size*scale,depth) for a,b in outline],.13,c)
    stroke([(x,y-.55*size,.23),(x,y+.45*size,.23)],.04,LIGHT)
def rays(x=0,y=0,r=.55,count=12,color=GOLD):
    for i in range(count):
        a=i*math.tau/count;m.crystal((x+math.cos(a)*r,y+math.sin(a)*r,0),(x+math.cos(a)*(r+.28),y+math.sin(a)*(r+.28),0),.045,color,4)
def heart(x=0,y=0,size=.6):
    outline=[(0,-.7),(-.72,.06),(-.62,.56),(-.22,.65),(0,.36),(.22,.65),(.62,.56),(.72,.06)]
    m.plate([(x+a*size,y+b*size,.13) for a,b in outline],.13,GOLD)
    m.plate([(x+a*size*.8,y+b*size*.8,.23) for a,b in outline],.1,LIGHT)
def wings(y=0):
    for side in [-1,1]:
        for i in range(4):m.carved_leaf((side*.16,y-i*.12,.12),(side*(.5+i*.15),y+.65-i*.16,.12),.16,LIGHT)
def arc(a,b,r=.8,color=GOLD,y=0):
    stroke([(math.cos(a+(b-a)*i/24)*r,y+math.sin(a+(b-a)*i/24)*r,0) for i in range(25)],.045,color)

# Venom bursts out of a cracked seed; charge is a forward blade, taunt a roaring mask.
m.ellipsoid((0,0,0),(.37,.43,.25),GREEN)
for i in range(8):
    a=i*math.tau/8;m.crystal((math.cos(a)*.4,math.sin(a)*.4,0),(math.cos(a)*.95,math.sin(a)*.95,0),.1,GREEN,5)
stroke([(-.13,.4,.25),(.08,.18,.28),(-.05,-.08,.28),(.12,-.39,.25)],.04,DARK);finish('venom-detonation')
sword(.17,.06,-.6)
for i in range(3):stroke([(-.95,-.35+i*.25,0),(-.38,-.25+i*.25,0)],.05,GOLD)
finish('charge')
m.plate([(-.6,.55,0),(-.52,-.42,0),(0,-.8,0),(.52,-.42,0),(.6,.55,0),(0,.85,0)],.15,TEAL)
for side in [-1,1]:
    stroke([(side*.14,.18,.15),(side*.4,.3,.15)],.06,LIGHT)
    stroke([(side*.62,-.05,0),(side*.95,.05,0)],.05,GOLD)
m.ellipsoid((0,-.28,.17),(.23,.28,.08),DARK);m.box((0,-.15,.26),(.3,.1,.08),LIGHT);finish('taunt')
wings(-.05);m.ring((0,.83,.1),.25,.035,GOLD,'z');stroke([(0,-.82,.1),(0,.39,.1)],.065,LIGHT);stroke([(-.23,-.42,.1),(0,-.66,.1),(.23,-.42,.1)],.055,GOLD);finish('revivify')

# Ranger passives: a bullseye, beast eye and growing seed held in a natural crown.
for r in [.3,.57,.85]:m.ring((0,0,0),r,.04,GOLD if r!=.57 else TEAL,'z')
arrow(.05,-.06,-.62);finish('precise-shots')
m.plate([(-.85,0,0),(-.35,.42,0),(.35,.42,0),(.85,0,0),(.35,-.38,0),(-.35,-.38,0)],.12,GREEN)
m.ellipsoid((0,0,.15),(.31,.34,.11),GOLD);m.ellipsoid((0,0,.25),(.065,.26,.06),DARK)
for side in [-1,1]:m.crystal((side*.5,.35,0),(side*.7,.75,0),.11,LIGHT,4)
finish('primal-focus')
stroke([(0,-.75,0),(0,-.15,0),(.05,.65,0)],.05,BARK)
for side in [-1,1]:
    for i in range(3):m.carved_leaf((0,-.44+i*.3,0),(side*(.45+i*.1),-.13+i*.3,0),.26,GREEN)
dot(0,.67,.16,GOLD);finish('natural-gift')

# Knight passives: separate blade, wall, guard, rally and momentum silhouettes.
rays(r=.55);m.ellipsoid((0,0,0),(.5,.5,.13),GOLD);sword(0,0,-.35);finish('sunbreaker')
arc(.15,math.pi*1.72,.88,LIGHT);sword(.12,0,-.9);finish('wide-swing')
for i in range(3):
    x=-.43+i*.4;m.crystal((x-.2,-.65,0),(x+.27,.69,0),.06,ICE,4)
for i in range(4):stroke([(-.77+i*.42,.18,.1),(-.59+i*.42,-.03,.1)],.025,GOLD)
finish('fine-cuts')
shield();m.ring((0,0,-.08),.98,.045,LIGHT,'z');finish('guard')
for x in [-.67,0,.67]:shield(x,0,.5)
stroke([(-1,-.55,.2),(1,-.55,.2)],.06,LIGHT);finish('hold-the-line')
m.plate([(-.7,-.16,0),(-.3,-.3,0),(.28,-.22,0),(.78,.48,0),(.35,.23,0),(-.3,.04,0),(-.7,.08,0)],.18,GOLD)
m.ring((.66,.37,.02),.28,.06,LIGHT,'z')
for i in range(3):stroke([(.72+i*.13,.7+i*.03,0),(.83+i*.13,.91+i*.03,0)],.03,LIGHT)
finish('courageous-call')
sword(-.12,.02,-.78);sword(.12,.02,.78)
m.plate([(-.8,-.66,.13),(0,-.32,.13),(.8,-.66,.13),(0,-.92,.13)],.1,GOLD);finish('into-the-fray')

# Mage passives: burning wings, lens rings, shattered crystal and a lucid frozen eye.
wings(-.2);m.flame((0,.09,.14),(.85,1.65,.35),FIRE);finish('heated-haste')
for r in [.3,.62,.9]:m.ring((0,0,0),r,.03,VIOLET if r!=.62 else GOLD,'z')
m.crystal((0,-.43,.14),(0,.43,.14),.23,ICE,6)
for a in [0,math.pi/2,math.pi,math.pi*1.5]:dot(math.cos(a)*.9,math.sin(a)*.9,.09,LIGHT)
finish('magic-focus')
for i in range(7):
    a=i*math.tau/7;m.crystal((math.cos(a)*.25,math.sin(a)*.25,0),(math.cos(a)*(.8+i%2*.23),math.sin(a)*(.8+i%2*.23),0),.14,ICE,5)
for i in range(4):dot((i-1.5)*.39,.14 if i%2 else -.16,.035,LIGHT)
finish('shatter')
m.plate([(-.8,0,0),(-.3,.3,0),(.3,.3,0),(.8,0,0),(.3,-.3,0),(-.3,-.3,0)],.11,VIOLET)
m.crystal((0,-.28,.18),(0,.31,.18),.17,ICE,6)
for side in [-1,1]:
    for i in range(3):m.crystal((side*.2,.3,0),(side*(.28+i*.22),.62+i%2*.18,0),.04,ICE,4)
finish('sharp-mind')

# Cleric passives: a radiant heart and a descending holy hammer.
heart();rays(r=.59,count=10,color=LIGHT);finish('healing-light')
stroke([(0,-.83,0),(0,.51,0)],.075,BARK);m.box((0,.49,0),(1.05,.45,.35),GOLD);m.box((0,.49,.21),(.22,.31,.08),LIGHT)
for side in [-1,1]:stroke([(side*.6,.2,0),(side*.77,-.4,0),(side*.47,-.27,0),(side*.6,-.8,0)],.045,LIGHT)
finish('righteous-force')

scene=bpy.context.scene;scene.name='Mossvale | September 28 skill icons'
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
world=bpy.data.worlds.new('Soft workshop light');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.25,.3,.4,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.world=world
bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='Icon camera';camera.data.type='ORTHO';scene.camera=camera
for location,power,color in [((-3,-4,5),650,(1,.85,.65)),((3,-1,2),450,(.65,.82,1))]:
    data=bpy.data.lights.new('Softbox','AREA');data.energy=power;data.color=color;data.size=4
    obj=bpy.data.objects.new('Softbox',data);scene.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
pixels=np.zeros((1280,1024,4),dtype=np.float32)
for i,obj in enumerate(m.objects):
    for other in m.objects:other.hide_render=other!=obj
    bpy.context.view_layer.update();corners=[obj.matrix_world@Vector(v) for v in obj.bound_box]
    lo=Vector(tuple(min(v[k] for v in corners) for k in range(3)));hi=Vector(tuple(max(v[k] for v in corners) for k in range(3)));center=(lo+hi)/2
    camera.location=center+Vector((.12,-6,1.0));camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=max(hi-lo)*1.2
    scene.render.filepath=str(ICONS/(names[i]+'.png'));bpy.ops.render.render(write_still=True)
    img=bpy.data.images.load(scene.render.filepath,check_existing=False);img.scale(256,256)
    x=i%4*256;y=(4-i//4)*256;pixels[y:y+256,x:x+256]=np.array(img.pixels[:],dtype=np.float32).reshape((256,256,4));bpy.data.images.remove(img)
    print('ICON',names[i],flush=True)
atlas=bpy.data.images.new('September 28 skill icons | 4 x 5',width=1024,height=1280,alpha=True);atlas.pixels.foreach_set(pixels.ravel());atlas.filepath_raw=str(ROOT/'public/ui/spells-september28.png');atlas.file_format='PNG';atlas.save()
for i,obj in enumerate(m.objects):obj.location=(i%4*2.7,i//4*2.7,0);obj.hide_render=False
scene['README']='Twenty separate authored sculptures. Rendered RGBA icons live in public/ui/spell-talents-2026-09-28; atlas slots follow manifest order.'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'spell-talent-icons.blend'))
(OUT/'manifest.json').write_text(json.dumps({'icons':names,'atlas':'public/ui/spells-september28.png','columns':4,'rows':5,'sourceIconSize':512},indent=2)+'\n')
print('DONE',len(names),'icons',flush=True)
