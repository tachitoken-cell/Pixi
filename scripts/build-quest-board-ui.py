"""Six original Blender renders for Mossvale's quest board.

Blender --background --python scripts/build-quest-board-ui.py
Retains editable geometry and reuses our authored forest and Rootvault libraries.
No words, reward values or controls are baked into any image.
"""
import bpy
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/ui/quest-board'
SOURCE = ROOT / 'assets/source/quest-board-ui.blend'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
random.seed(71824)


def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4


def material(name, hex_color, roughness=.85, metal=0, emission=0, grain=False):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    tree = result.node_tree
    shader = tree.nodes.get('Principled BSDF')
    rgb = tuple(linear(int(hex_color[i:i + 2], 16) / 255) for i in (0, 2, 4))
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metal
    if emission:
        shader.inputs['Emission Color'].default_value = (*rgb, 1)
        shader.inputs['Emission Strength'].default_value = emission
    if grain:
        noise = tree.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 105
        noise.inputs['Detail'].default_value = 2
        ramp = tree.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (*[v * .93 for v in rgb], 1)
        ramp.color_ramp.elements[1].color = (*[min(1, v * 1.04) for v in rgb], 1)
        tree.links.new(noise.outputs['Fac'], ramp.inputs[0])
        tree.links.new(ramp.outputs['Color'], shader.inputs['Base Color'])
        bump = tree.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .12
        bump.inputs['Distance'].default_value = .008
        tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
        tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return result


M = {key: material(key, color, **options) for key, color, options in [
    ('Oak', '705035', {}), ('Oak edge', 'A37B4A', {}), ('Dark oak', '3D3025', {}),
    ('Brass', 'C39746', {'roughness': .3, 'metal': .65}), ('Gold edge', 'F0D080', {'roughness': .27, 'metal': .55}),
    ('Teal', '245E51', {}), ('Moss', '527A30', {}), ('Leaf', '87AE45', {}),
    ('Parchment', 'EFDEB5', {'grain': True}), ('Paper edge', 'CFB27E', {'grain': True}), ('Paper light', 'F3E4C3', {'grain': True}),
    ('Grass', '649146', {}), ('Grass dark', '476E39', {}), ('Grass light', '8AAF53', {}),
    ('Path', 'B89761', {}), ('Path light', 'D3B882', {}), ('Earth', '73543B', {}),
    ('Stone', '778E82', {}), ('Stone light', 'A8B5A1', {}), ('Stone dark', '3F5651', {}),
    ('Iron', '394A49', {'roughness': .42, 'metal': .65}), ('Steel', '95A6A2', {'roughness': .3, 'metal': .55}),
    ('Slime', '73B83B', {'roughness': .45}), ('Slime light', 'A0D54F', {'roughness': .45}), ('Eye', '182720', {}), ('Cream', 'FFF1C3', {}),
    ('Amber glow', 'FFCC5C', {'emission': 1.2}), ('Fire', 'ED782C', {'emission': 2}), ('Fire light', 'FFE096', {'emission': 3}),
    ('Cyan glow', '87EBD0', {'emission': 2.4}), ('Berry', 'C94D43', {}), ('Violet cap', '9C80BC', {}),
]}


def mesh(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.materials.append(mat)
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def box(name, at, size, mat, bevel=0, turn=0):
    w, d, h = size
    verts = [(x * w / 2, y * d / 2, z * h / 2) for x, y, z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]
    obj = mesh(name, verts, faces, mat)
    obj.location = at
    obj.rotation_euler.z = turn
    if bevel:
        edge = obj.modifiers.new('Carved single-step edge', 'BEVEL')
        edge.width, edge.segments = bevel, 1
        obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
    return obj


def cylinder(name, at, radius, depth, mat, vertices=12, axis='Z'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    if axis == 'X': obj.rotation_euler.y = math.pi / 2
    if axis == 'Y': obj.rotation_euler.x = math.pi / 2
    return obj


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def area(at, target, energy, size, tint=(1, .88, .7)):
    bpy.ops.object.light_add(type='AREA', location=at)
    obj = bpy.context.object
    obj.data.energy, obj.data.size, obj.data.color = energy, size, tint
    aim(obj, target)
    return obj


def new_scene(name, width, height, scale, camera, target, transparent=False, dark=False):
    scene = bpy.data.scenes.new('Quest board · ' + name)
    bpy.context.window.scene = scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 5
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.film_transparent = transparent
    scene.render.filter_size = 1.1
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.world = bpy.data.worlds.new(name + ' atmosphere')
    scene.world.use_nodes = True
    world = scene.world.node_tree.nodes['Background']
    world.inputs['Color'].default_value = (.075, .13, .15, 1) if dark else (.30, .43, .53, 1)
    world.inputs['Strength'].default_value = .25 if dark else .65
    bpy.ops.object.camera_add(location=camera)
    scene.camera = bpy.context.object
    scene.camera.name = name + ' final composition camera'
    scene.camera.data.type = 'ORTHO'
    scene.camera.data.sensor_fit = 'HORIZONTAL'
    scene.camera.data.ortho_scale = scale
    aim(scene.camera, target)
    scene.render.filepath = str(OUT / (name + '.png'))
    return scene


def leaf(at, length=.45, angle=0, mat=None):
    w = length * .3
    verts = [(0,-length/2,0),(-w,-length*.15,0),(-w*.7,length*.2,0),(0,length/2,0),(w*.7,length*.2,0),(w,-length*.15,0),(0,0,.06)]
    obj = mesh('Faceted woodland leaf', verts, [(i,(i+1)%6,6) for i in range(6)], mat or M['Leaf'])
    obj.location = at
    obj.rotation_euler.z = angle
    return obj


# Header crest: real carved oak, a sunburst and a warm brass lantern with leaves.
crest = new_scene('crest', 320, 320, 3.9, (0,0,10), (0,0,0), True)
area((-3,4,6),(0,0,0),550,4)
area((3,-1,5),(0,0,0),160,4,(.72,.88,1))
cylinder('Carved oak medallion', (0,0,0), 1.04, .2, M['Dark oak'], 16)
cylinder('Brass sun medallion', (0,0,.13), .95, .14, M['Brass'], 16)
cylinder('Recessed moss enamel', (0,0,.215), .77, .05, M['Teal'], 16)
for i in range(12):
    a = i * math.tau / 12
    box('Stepped sun ray', (math.sin(a)*1.07,math.cos(a)*1.07,.07),(.19,.42,.12),M['Brass'],.025,-a)
    box('Sun ray highlight', (math.sin(a)*1.23,math.cos(a)*1.23,.145),(.10,.12,.035),M['Gold edge'],.008,-a)
box('Lantern amber heart',(0,0,.37),(.66,.84,.24),M['Amber glow'],.06)
for x in [-.39,.39]: box('Lantern brass upright',(x,0,.53),(.10,.93,.10),M['Brass'],.018)
for y in [-.50,.50]: box('Lantern brass crown',(0,y,.49),(.91,.15,.22),M['Brass'],.025)
box('Lantern crown bevel',(0,.63,.48),(.65,.15,.19),M['Gold edge'],.025)
cylinder('Lantern handle outer',(0,.84,.45),.21,.075,M['Brass'],16)
cylinder('Lantern handle inset',(0,.84,.494),.12,.015,M['Teal'],16)
box('Light central diamond',(0,.025,.51),(.27,.27,.025),M['Cream'],.018,math.pi/4)
for side in [-1,1]:
    for i in range(5):
        leaf((side*(.60+i*.13),-.73+i*.09,.30),.53-i*.035,side*(-.6-i*.14),M['Moss'] if i%2 else M['Leaf'])
    box('Lower oak branch',(side*.68,-.95,.19),(.09,.78,.10),M['Oak edge'],.015,side*1.14)
for i in range(26):
    x = random.uniform(-.82,.82); y = random.uniform(-1.18,-.84)
    box('Small moss voxel',(x,y,.27),(.07,.07,.055),M['Moss'] if i%3 else M['Leaf'],.009)
crest['pixel_contract'] = '320 square transparent. Art stays inside a 16px margin. Original lantern sun crest; no words.'


# A quiet, continuous paper surface with modeled ragged edges and rolled ends.
notice = new_scene('notice',512,800,5.12,(0,0,12),(0,0,0),True)
notice.view_settings.exposure = .6
area((-4,5,8),(0,0,0),540,6,(1,.92,.78))
area((4,-3,6),(0,0,0),130,7,(.88,.93,1))
nx, ny = 20, 44
vertices, faces = [], []
edge_offsets = [random.uniform(-.043,.032) for _ in range(ny+1)]
for j in range(ny+1):
    y = -3.56+j/ny*7.0
    for i in range(nx+1):
        x = -2.24+i/nx*4.48
        edge = abs(2*i/nx-1)
        if i in [0,nx]: x += edge_offsets[j] * (1 if i==nx else -1)
        yy = y + (random.uniform(-.035,.03) if j in [0,ny] else 0)
        z = .025+.075*edge**8+.018*math.sin(y*1.7)*edge**3
        vertices.append((x,yy,z))
for j in range(ny):
    for i in range(nx):
        a=j*(nx+1)+i
        faces.append((a,a+1,a+nx+2,a+nx+1))
sheet = mesh('Editable ragged ivory parchment',vertices,faces,M['Parchment'])
sheet.data.materials.append(M['Paper edge'])
sheet.data.materials.append(M['Paper light'])
for p in sheet.data.polygons:
    col,row=p.index%nx,p.index//nx
    p.material_index=1 if col in [0,nx-1] or row==0 else (2 if col in [1,nx-2] else 0)
solid=sheet.modifiers.new('Parchment thickness','SOLIDIFY');solid.thickness=.025
cylinder('Rolled top parchment',(0,3.44,.11),.155,4.67,M['Paper light'],24,'X')
for side in [-1,1]:
    cylinder('Visible paper roll inset',(side*2.34,3.44,.11),.105,.016,M['Paper edge'],24,'X')
    cylinder('Paper roll hollow',(side*2.351,3.44,.11),.046,.015,M['Oak'],16,'X')
cylinder('Small curled lower edge',(0,-3.53,.07),.073,4.49,M['Paper edge'],20,'X')
notice['pixel_contract']='512x800 transparent outside. Keep text inside x58..454,y88..720. Continuous quiet ivory center; no baked text.'


# Load our actual editable voxel environment meshes into a retained source scene.
library=bpy.data.scenes.new('Reusable authored voxel library')
bpy.context.window.scene=library
models={}
for filename in ['giant-trees','rootvault-kit']:
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models'/f'{filename}.glb'))
    imported=set(bpy.data.objects)-before
    for obj in imported:
        if not obj.parent or obj.parent not in imported: models[obj.name]=obj


def place(name, at, scale=1, turn=0):
    source=models[name]
    wrapper=bpy.data.objects.new(name+' scenic placement',None)
    bpy.context.scene.collection.objects.link(wrapper)
    wrapper.location=at
    wrapper.scale=(scale,scale,scale)
    wrapper.rotation_euler.z=turn
    def clone(old,parent):
        new=old.copy()
        new.data=old.data
        bpy.context.scene.collection.objects.link(new)
        new.parent=parent
        new.matrix_parent_inverse.identity()
        new.matrix_basis=old.matrix_basis.copy()
        for child in old.children: clone(child,new)
    clone(source,wrapper)
    return wrapper


def landscape(name, dark=False):
    scene=new_scene(name,640,320,15,(9,-15,10),(0,1,1.3),False,dark)
    area((-7,-5,13),(0,1,0),1800 if not dark else 420,7,(1,.90,.70) if not dark else (.60,.84,1))
    area((6,4,9),(0,0,1),450 if not dark else 120,6,(.65,.86,1))
    return scene


def ground(woodland=True):
    box('Deep ground',(0,4,-.48),(45,45,.9),M['Earth'] if woodland else M['Stone dark'])
    for x in range(-11,12):
        for y in range(-9,15):
            shade=(math.sin(x*.41)+math.cos(y*.33)+math.sin(x*.2+y*.3))/3
            mat=(M['Grass light'] if shade>.48 else M['Grass dark'] if shade<-.5 else M['Grass']) if woodland else random.choice([M['Stone'],M['Stone dark'],M['Stone light']])
            h=.12+max(0,.09*math.sin(x*.26)*math.cos(y*.31)) if woodland else .12+random.choice([0,.045,.09])
            box('Voxel terrain tile',(x,y,h/2-.015),(.99,.99,h),mat)


def grove():
    for x,y,s in [(-6,0,.72),(5,5,.80),(-3,8,.80),(1,11,.85),(-9,9,.85),(8,10,.80)]:
        place('WoodlandOak',(x,y,0),s,random.random()*math.tau)
    for x,y,s in [(9,13,.8),(-7,13,.85),(-1,15,.72)]:place('WoodlandPine',(x,y,0),s)
    for x,y,s in [(-8,-2,.88),(7,-1,.85),(-5,6,.60),(4,9,.68)]:place('WoodlandOak',(x,y,0),s,random.random()*math.tau)
    for x,y in [(-5,-2),(-4,-4),(4,-3),(5,0),(-4,3),(4,5),(-5,7),(5,8)]:
        for i in range(7):
            dx,dy=random.uniform(-.55,.55),random.uniform(-.55,.55)
            size=random.uniform(.25,.50)
            box('Low woodland bush',(x+dx,y+dy,.25+size*.35),(size,size,size),M['Grass dark'] if i%3==0 else M['Leaf'])
        for i in range(9):
            dx,dy=random.uniform(-.8,.8),random.uniform(-.8,.8)
            blade=box('Woodland grass blade',(x+dx,y+dy,.22),(.07,.08,.4),M['Grass light'])
            blade.rotation_euler.y=random.uniform(-.35,.35)
    # Distant stepped hill silhouettes remain actual geometry behind the grove.
    for x in range(-18,21,4):
        for tier in range(3):box('Distant woodland hill',(x,21+tier*2,tier*.9), (7-tier,8,2), M['Grass dark'])


def plants(x,y,spread=.5,berries=False):
    for i in range(8):
        a=i*math.tau/8
        blade=box('Angular herb leaf',(x+math.cos(a)*spread*.32,y+math.sin(a)*spread*.32,.28),(.12,.12,.62),M['Leaf'] if i%2 else M['Grass light'])
        blade.rotation_euler=(math.sin(a)*.45,math.cos(a)*.45,a)
    if berries:
        for i in range(4):box('Red woodland berry',(x+(i%2-.5)*.2,y+(i//2-.5)*.18,.6),(.15,.15,.15),M['Berry'],.018)


def slime(at,scale=1):
    x,y,z=at
    for zz,w,d,h,mat in [(0.25,1.35,1.05,.45,'Slime'),(.62,1.5,1.2,.48,'Slime'),(.95,1.2,.98,.28,'Slime light'),(1.15,.7,.62,.18,'Slime light')]:
        box('Moss slime voxel body',(x,y,z+zz*scale),(w*scale,d*scale,h*scale),M[mat],.018)
    for xx in [-.32,.32]:
        box('Slime black eye',(x+xx*scale,y-.611*scale,z+.70*scale),(.13*scale,.04*scale,.2*scale),M['Eye'])
        box('Slime ivory eye glint',(x+(xx-.025)*scale,y-.64*scale,z+.76*scale),(.042*scale,.015*scale,.065*scale),M['Cream'])
    box('Slime smile',(x,y-.63*scale,z+.45*scale),(.16*scale,.02*scale,.055*scale),M['Eye'])


hunt=landscape('hunt');ground();grove()
for y in range(-10,16):
    mid=math.sin(y*.23)*1.35
    for col in [-1,0,1]:box('Winding woodland path',(mid+col*.86,y,.15),(.87,1.01,.11),M['Path light'] if (y+col)%4==0 else M['Path'])
slime((.8,-1.4,.19),1.5)
slime((-1.3,3.5,.19),.70)
for x,y in [(-3,-3),(3,-1),(-2,1),(4,1),(-4,5),(2,6)]:plants(x,y,.6,y%2==0)
box('Trail signpost',(-3.6,1,1.1),(.19,.19,2.2),M['Oak'])
box('Unlettered trail arrow',(-3.6,1,1.85),(1.1,.12,.35),M['Oak edge'],.035)


gather=landscape('gather');ground();grove()
for x,y in [(-2,-2),(0,-3),(2,-1),(3,2),(-3,2),(-1,1)]:plants(x,y,.75,True)
for x,y,z in [(-1.7,0,.45),(-.7,0,.45),(-1.2,0,1.20)]:
    cylinder('Cut oak log',(x,y,z),.48,3.3,M['Oak'],10,'Y')
    cylinder('Honey cut timber face',(x,y-1.66,z),.405,.025,M['Oak edge'],10,'Y')
    cylinder('Heartwood cut ring',(x,y-1.68,z),.235,.025,M['Path'],10,'Y')
    cylinder('Heartwood center',(x,y-1.70,z),.075,.025,M['Oak'],8,'Y')
for x,y in [(2.4,-2.6),(3.1,-2.1),(2.9,-3.2)]:
    box('Mushroom ivory stalk',(x,y,.31),(.13,.13,.55),M['Cream'])
    box('Stepped mushroom cap',(x,y,.58),(.59,.51,.18),M['Violet cap'],.055)
box('Herbalist basket',(2.2,1,.35),(1.25,.90,.6),M['Oak edge'],.045)
for i in range(4):box('Basket woven rib',(1.75+i*.30,.53,.4),(.055,.05,.70),M['Oak'])
plants(2.2,1,.8)


craft=landscape('craft',True)
craft.camera.location=(8,-13,9);aim(craft.camera,(0,1.6,1.55));craft.camera.data.ortho_scale=14
box('Workshop floor foundation',(0,0,-.25),(30,30,.5),M['Dark oak'])
for x in range(-9,10):
    for y in range(-6,8):box('Wide workshop floorboard',(x,y,.025),(.98,.98,.09),M['Oak edge'] if (x+y)%4 else M['Oak'])
box('Ivory plaster rear wall',(0,6,3),(22,.45,6),M['Paper edge'])
box('Workshop side wall',(-7,2,3),(.45,8,6),M['Paper edge'])
for x in [-7,-3,2,7]:box('Exposed oak wall beam',(x,5.7,3),(.30,.40,6),M['Oak'])
for z in [1.1,3.2,5.8]:box('Horizontal timber framing',(0,5.68,z),(19,.38,.23),M['Oak'])
box('Workshop workbench',(-2.5,1.9,1.35),(4.6,1.65,.23),M['Oak edge'],.025)
for x in [-4.4,-.6]:
    for y in [1.25,2.55]:box('Heavy workbench leg',(x,y,.64),(.28,.28,1.28),M['Oak'])
box('Teal folded cloth',(-3.4,1.7,1.52),(1.6,.92,.12),M['Teal'])
box('Workbench tool head',(-1.8,1.55,1.63),(.7,.25,.28),M['Steel'],.035,.24)
box('Hammer wooden handle',(-1.85,1.05,1.55),(.12,1.05,.12),M['Oak'],.018,.24)
for x in [-3.6,-2.9,-2.2]:
    cylinder('Workshop jar',(x,2.4,1.76),.18,.52,M['Teal'] if x<-3 else M['Amber glow'],8)
    cylinder('Jar cork',(x,2.4,2.04),.12,.09,M['Oak edge'],8)
box('Anvil oak stump',(2,-.1,.50),(1.4,1.2,1),M['Oak'],.10)
box('Anvil foot',(2,-.1,1.07),(1.35,1.02,.22),M['Iron'],.04)
box('Anvil waist',(2,-.1,1.42),(.65,.62,.65),M['Iron'],.06)
box('Anvil polished face',(2,-.1,1.82),(1.85,.77,.23),M['Steel'],.04)
bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=.35,radius2=.055,depth=1,location=(3.2,-.1,1.78))
horn=bpy.context.object;horn.name='Forged anvil horn';horn.rotation_euler.y=math.pi/2;horn.data.materials.append(M['Steel'])
for z in [.3,.9,1.5,2.1,2.7]:
    for x in [3.7,6.1]:box('Hearth stone side',(x,4.7,z),(.7,1.65,.58),M['Stone dark'],.035)
box('Hearth mantel',(4.9,4.7,3.1),(3.25,1.9,.50),M['Stone'],.07)
box('Hearth dark recess',(4.9,5.35,1.6),(1.8,.2,2.6),M['Dark oak'])
for i in range(11):
    x=4.9+random.uniform(-.66,.66);y=4.4+random.uniform(-.45,.45);z=.45+random.uniform(0,.5)
    box('Voxel hearth flame',(x,y,z),(.29,.27,.50+random.random()*.65),M['Fire light'] if i%3==0 else M['Fire'],.02,random.random())
area((4.9,3.8,1.4),(0,0,1),650,2,(1,.35,.07))
area((-4,-4,7),(0,2,1),1300,5,(1,.82,.58))
for x in [-4.4,-2.8]:
    box('Wall shelf',(x,5.23,3.8),(1.5,.85,.16),M['Oak edge'])
    for i in range(3):box('Workshop books',(x-.5+i*.4,5.25,4.12),(.29,.50,.48),M['Teal'] if i%2 else M['Paper light'],.015)


dungeon=landscape('dungeon',True);ground(False)
dungeon.camera.location=(4,-17,10);aim(dungeon.camera,(0,3,2.1));dungeon.camera.data.ortho_scale=15
for x in [-7.4,7.4]:
    for y in [1,8]:place('rootvault-pillar',(x,y,0),1.1)
place('rootvault-arch',(0,6.2,0),1.5)
place('rootvault-seal',(0,6.5,.10),1.2)
place('rootvault-chest',(0,2,.15),1.4,math.pi)
place('rootvault-mushrooms',(-3.5,-1,.15),1.2)
place('rootvault-mushrooms',(3,3,.15),.9)
for x in [-4.2,4.2]:place('rootvault-brazier',(x,1.2,.15),1.1)
for x in [-8.5,8.5]:box('Ancient dungeon wall',(x,7,3),(1.5,18,6),M['Stone dark'])
box('Deep rootvault darkness',(0,12,4),(25,1,10),M['Dark oak'])
for x,y in [(-4.5,5),(4.3,6),(-5,-2)]:
    for i in range(7):box('Creeping stepped roots',(x+math.sin(i*.5)*.45,y+i*.35,.24+i*.2),(.43,.58,.43),M['Oak'])
area((0,5,3),(0,1,0),1050,3,(.22,1,.72))
area((-4,0,2),(0,1,0),350,2,(1,.61,.22))
area((4,0,2),(0,1,0),350,2,(.40,.95,.70))
for x in [-2.3,2.3]:
    box('Rootvault glowing crystal',(x,3.3,.7),(.28,.28,1.3),M['Cyan glow'],.02,.3)
    box('Rootvault little crystal',(x+.3,3.5,.4),(.2,.2,.7),M['Cyan glow'],.01,-.4)


renders=[crest,notice,hunt,gather,craft,dungeon]
for scene in renders:
    scene['provenance']='Original Mossvale Blender geometry. Scenic forest and dungeon meshes reuse public/models/giant-trees.glb and rootvault-kit.glb. No raster inputs.'
bpy.context.window.scene=hunt
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
for scene in renders:
    bpy.context.window.scene=scene
    bpy.ops.render.render(write_still=True)
    path=Path(scene.render.filepath)
    image=bpy.data.images.load(str(path),check_existing=False)
    w,h=image.size
    assert (w,h)==(scene.render.resolution_x,scene.render.resolution_y)
    alpha=list(image.pixels)[3::4]
    if scene.render.film_transparent:
        assert min(alpha)==0 and max(alpha)>.99
        assert all(alpha[y*w+x]==0 for x,y in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)])
    else: assert min(alpha)>.99, 'Landscape is full bleed and opaque'
    bpy.data.images.remove(image)
    print('QUEST_BOARD_RENDER',path.name,w,h,path.stat().st_size,flush=True)
print('PASS: six original Blender quest-board renders; editable source retained.',flush=True)
