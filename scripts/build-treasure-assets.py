"""Blender-authored treasure goblin, shady merchant, escape portal and MOSS seal.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-treasure-assets.py -- --render
Original Mossvale voxel geometry. Metres, Y up, +Z front, ground origins.
"""
import bpy
import math
import sys
from pathlib import Path
from mathutils import Vector, Euler

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/treasure-goblin.blend'
EXPORT = ROOT / 'public/models/treasure-goblin.glb'
PREVIEW = ROOT / 'assets/source/treasure-goblin-preview.png'
ICON = ROOT / 'public/ui/loot/moss-voucher.png'
for path in [SOURCE, EXPORT, PREVIEW, ICON]: path.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene; scene.name = 'Treasure models - authored source'
scene.render.fps = 30; scene.frame_start = 0; scene.frame_end = 42

def xyz(p): return Vector((p[0], -p[2], p[1]))
def rgba(hex):
    values = [int(hex[i:i+2], 16)/255 for i in (0, 2, 4)]
    return tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in values)+(1,)

palette = {'skin':'7BA54F', 'skinlight':'B0C573', 'skinshade':'477350', 'ink':'242A30',
    'eye':'F9D47D', 'bone':'F4E4BB', 'vest':'653F4E', 'vestlight':'956255',
    'leather':'584336', 'leatherlight':'806248', 'sack':'A77849', 'sacklight':'CFAB71',
    'sackshade':'785236', 'gold':'E4B75F', 'goldlight':'FFE2A0', 'gem':'5ECDB2',
    'ruby':'C97588', 'robe':'394347', 'robelight':'526265', 'robeshade':'273336',
    'lining':'796274', 'face':'C0AA83', 'violet':'8DAFDD', 'portal':'55C5AD',
    'portallight':'B2F7D2', 'portalshade':'287C78', 'void':'163E45'}
mats = []
for name, metal, emission in [('Woodland palette', 0, 0), ('Treasure gold', .7, 0), ('Portal light', .05, .9)]:
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF'); shader.inputs['Roughness'].default_value = .72
    shader.inputs['Metallic'].default_value = metal
    tint = mat.node_tree.nodes.new('ShaderNodeVertexColor'); tint.layer_name = 'TreasureTint'
    mat.node_tree.links.new(tint.outputs['Color'], shader.inputs['Base Color'])
    if emission:
        # glTF has no emissive vertex colors; a fixed jade glow exports faithfully.
        shader.inputs['Emission Color'].default_value = rgba('36B997')
        shader.inputs['Emission Strength'].default_value = emission
    mats.append(mat)

parts = {}; roots = {}; objects = {}; active = ''; current = ''
def model(name, prefix=None):
    global active
    active = name; parts[name] = {}; roots[name] = bpy.data.objects.new(name, None)
    roots[name]['authoredWith'] = 'Blender'; roots[name]['axes'] = 'Y up; +Z front; ground origin; metres'
    roots[name]['rigPrefix'] = prefix or name; scene.collection.objects.link(roots[name])
def part(name, pivot, parent=None):
    global current
    current = name; parts[active][name] = {'pivot':Vector(pivot), 'parent':parent, 'vertices':[], 'faces':[], 'colors':[], 'materials':[]}
def shape(tint, points, faces, material=0):
    data = parts[active][current]; offset = len(data['vertices'])
    data['vertices'].extend(xyz(Vector(p)-data['pivot']) for p in points)
    data['faces'].extend(tuple(i+offset for i in face) for face in faces)
    data['colors'].extend([rgba(palette[tint])]*len(faces)); data['materials'].extend([material]*len(faces))
def box(tint, x,y,z,w,h,d, rx=0,ry=0,rz=0, material=0):
    rotation = Euler((rx,ry,rz)).to_matrix()
    points = [rotation @ Vector((a*w/2,b*h/2,c*d/2))+Vector((x,y,z)) for a,b,c in
        [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    shape(tint, points, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)], material)
def jewel(tint,x,y,z,w=.13,h=.21,d=.13):
    shape(tint,[(x-w,y,z),(x,y,z-d),(x+w,y,z),(x,y,z+d),(x,y+h,z),(x,y-h*.35,z)],
        [(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)],1)
def coin(x,y,z,r=.11,thickness=.035,vertical=False):
    points=[]
    for side in (-1,1):
        for i in range(8):
            a=i*math.tau/8
            points.append((x+math.cos(a)*r,y+math.sin(a)*r,z+side*thickness/2) if vertical else
                (x+math.cos(a)*r,y+side*thickness/2,z+math.sin(a)*r))
    shape('gold',points,[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)],1)

# A hunched, broad-eared woodland thief dwarfed by an overstuffed treasure sack.
model('lootGoblin','treasure-goblin'); part('body',(0,.70,0))
box('vest',0,.81,.03,.58,.57,.46,rx=.13); box('skin',0,1.01,.15,.43,.30,.41)
box('leather',0,.54,.02,.62,.16,.52); box('gold',0,.55,.294,.17,.14,.06,material=1)
box('ink',0,.55,.332,.095,.065,.014)
for side in (-1,1):
    box('sackshade',side*.23,.99,.225,.095,.47,.08,rz=-side*.20)
    box('gold',side*.23,.90,.277,.10,.06,.028,material=1)
box('vestlight',0,.76,.275,.18,.28,.04)
for y in (.68,.78,.88): box('bone',0,y,.305,.025,.055,.017,rz=.65)
part('head',(0,1.08,.24),'body')
box('skin',0,1.24,.32,.64,.48,.50); box('skinlight',0,1.43,.36,.47,.13,.39)
box('skinshade',0,1.095,.46,.52,.22,.35)
# Large stepped pointed ears, angular brows, long hooked nose and a lopsided grin.
for side in (-1,1):
    box('skin',side*.39,1.33,.32,.30,.23,.20,rz=side*.28)
    box('skin',side*.58,1.40,.29,.22,.14,.14,rz=side*.33)
    box('skinlight',side*.71,1.45,.27,.13,.08,.09,rz=side*.35)
    box('skinshade',side*.44,1.33,.435,.25,.08,.017,rz=side*.32)
    box('ink',side*.17,1.30,.583,.19,.13,.042)
    box('eye',side*.17,1.305,.61,.13,.071,.027)
    box('ink',side*.15,1.306,.628,.034,.076,.018)
    box('skinshade',side*.18,1.386,.601,.26,.065,.055,rz=-side*.23)
box('skinlight',0,1.30,.65,.19,.26,.20,rx=-.12)
box('skin',0,1.18,.757,.24,.18,.19); box('skinshade',0,1.135,.801,.21,.055,.095)
box('ink',0,1.075,.65,.37,.062,.039,rz=.06)
for x,h in [(-.16,.12),(.13,.085)]: box('bone',x,1.10,.678,.053,h,.055,rz=-x)
coin(-.59,1.29,.44,.105,.035,True); box('skinshade',-.59,1.30,.466,.086,.10,.014)
box('leather',0,1.50,.25,.40,.055,.21)
for side,label in [(-1,'left-leg'),(1,'right-leg')]:
    part(label,(side*.20,.52,.03),'body')
    box('skin',side*.20,.37,.045,.20,.32,.23,rx=-.08)
    box('leather',side*.20,.15,.10,.25,.20,.32)
    box('leatherlight',side*.20,.085,.24,.28,.15,.30)
    box('gold',side*.20,.19,.269,.12,.065,.025,material=1)
for side,label in [(-1,'left-arm'),(1,'right-arm')]:
    part(label,(side*.32,1.0,.07),'body')
    box('skin',side*.38,.86,.10,.20,.33,.22,rz=side*.20)
    box('skinshade',side*.41,.68,.20,.17,.24,.20,rx=-.25)
    box('gold',side*.42,.62,.25,.21,.09,.23,material=1)
    box('skinlight',side*.43,.55,.30,.23,.17,.23)
    for n in range(3): box('skin',side*.43+(n-1)*.07,.51,.421,.055,.10,.08)
part('sack',(0,1.05,-.26),'body')
for tint,y,w,h,d,z in [('sackshade',.87,.92,.34,.65,-.41),('sack',1.14,1.06,.45,.79,-.45),
        ('sacklight',1.48,.91,.30,.73,-.48),('sack',1.67,.70,.19,.55,-.45)]:
    box(tint,0,y,z,w,h,d)
box('sackshade',0,1.80,-.44,.65,.12,.48); box('ink',0,1.86,-.44,.53,.065,.35)
for side in (-1,1):
    box('sackshade',side*.37,1.24,-.037,.13,.68,.032,rz=side*.15)
    box('sacklight',side*.39,1.11,-.864,.085,.46,.02,rz=-side*.10)
    for n in range(5): box('bone',side*.39,1.05+n*.11,-.883,.09,.02,.017,rz=.35)
box('leather',0,1.72,-.148,.78,.10,.06); box('gold',0,1.71,-.097,.15,.13,.036,material=1)
for i in range(12):
    a=i*2.39; r=.12+(i%3)*.055
    coin(math.cos(a)*r,1.88+(i%3)*.035,-.44+math.sin(a)*r,.09,.035)
jewel('gem',-.19,1.95,-.46,.10,.20,.10); jewel('ruby',.20,1.91,-.43,.09,.14,.10)
coin(.35,1.41,-.02,.14,.05,True)

# The fence: a tall, anonymous hood and mismatched belts; a gold testing scale.
model('shadyMerchant'); part('body',(0,1.03,0))
for tint,y,w,h,d in [('robeshade',.22,.94,.43,.65),('robe',.61,.84,.45,.57),('robe',1.03,.73,.48,.53),('robelight',1.39,.83,.29,.57)]:
    box(tint,0,y,0,w,h,d)
for side in (-1,1):
    box('robelight',side*.31,.57,.30,.12,.94,.04,rz=side*.045)
    box('leather',side*.22,.075,.19,.29,.15,.46)
box('lining',0,.66,.326,.19,1.14,.025)
box('leather',0,1.07,.055,.81,.15,.59); box('gold',.13,1.07,.368,.19,.15,.045,material=1)
box('ink',.13,1.07,.398,.11,.074,.015)
box('leatherlight',-.34,.87,.30,.27,.31,.21); box('gold',-.34,.96,.425,.09,.05,.032,material=1)
part('head',(0,1.54,0),'body')
box('robeshade',0,1.80,.00,.67,.55,.59)
box('robe',0,2.10,-.055,.53,.18,.43); box('robelight',0,2.22,-.10,.33,.09,.28)
box('ink',0,1.81,.319,.45,.39,.025)
for side in (-1,1): box('robelight',side*.29,1.80,.337,.13,.54,.115,rz=-side*.06)
box('robelight',0,2.075,.309,.57,.11,.10)
box('face',0,1.76,.347,.21,.21,.075); box('robeshade',0,1.66,.40,.37,.13,.085)
for side in (-1,1): box('eye',side*.125,1.89,.346,.055,.024,.018)
box('face',0,1.82,.404,.07,.16,.13)
part('left-arm',(-.42,1.45,0),'body')
box('robe',-.49,1.23,.035,.29,.48,.36,rz=-.20); box('lining',-.55,1.02,.10,.31,.16,.34)
box('face',-.55,.91,.17,.18,.15,.19)
part('right-arm',(.42,1.45,0),'body')
box('robe',.50,1.29,.10,.30,.33,.35,rz=.25)
box('robelight',.55,1.15,.30,.29,.27,.45,rx=-.5); box('face',.54,1.18,.56,.19,.15,.18)
# Suspended balance beam makes the merchant readable even at game-camera distance.
box('gold',.57,1.40,.66,.035,.40,.035,material=1)
box('gold',.57,1.57,.66,.49,.045,.045,material=1)
for side in (-1,1):
    x=.57+side*.20
    box('gold',x,1.42,.66,.018,.29,.018,material=1)
    box('gold',x,1.27,.66,.22,.045,.19,material=1)
    if side==1: coin(x,1.31,.66,.063,.035)

# A stepped spectral ring and inset swirl; no texture dependency or solid quad.
model('goblinPortal'); part('ring',(0,1.24,0))
for i in range(28):
    a=i*math.tau/28; x=math.cos(a); y=1.24+math.sin(a)*1.10
    box('portalshade',x,y,0,.24,.24,.18,rz=a,material=2)
    box('portal',x*.96,1.24+(y-1.24)*.96,.065,.15,.15,.13,rz=a,material=2)
    if i%3==0: box('portallight',x*1.04,1.24+(y-1.24)*1.04,.105,.07,.17,.045,rz=a,material=2)
part('swirl',(0,1.24,0))
for i in range(35):
    a=i*.39; r=.12+i*.020
    box('portal' if i%4 else 'portallight',math.cos(a)*r,1.24+math.sin(a)*r*1.18,.005,.10,.11,.045,rz=a,material=2)
current='ring'  # The feet stay still when the client turns the swirl pivot.
for side in (-1,1):
    box('void',side*.83,.10,0,.39,.20,.42)
    box('portal',side*.83,.23,.03,.16,.07,.19,material=2)

# An octagonal MOSS seal with folded parchment and a raised woodland rune.
model('mossVoucher'); part('body',(0,.43,0))
box('sackshade',0,.44,-.055,.66,.83,.10)
box('bone',0,.47,.009,.59,.74,.067)
box('sacklight',0,.82,.02,.63,.13,.13); box('sacklight',0,.09,.02,.63,.13,.13)
coin(0,.45,.089,.31,.07,True)
box('skinshade',0,.45,.134,.38,.39,.023)
for x in (-.13,.13): box('goldlight',x,.45,.157,.057,.27,.026,material=1)
box('goldlight',-.06,.51,.157,.055,.18,.026,rz=.55,material=1)
box('goldlight',.06,.51,.157,.055,.18,.026,rz=-.55,material=1)
for x in (-.23,.23): box('vest',x,.18,.07,.12,.28,.034,rz=x*.4)

# One mesh per named pivot, vertex colors and only three shared materials.
for name,rig in parts.items():
    objects[name]={}; prefix=roots[name]['rigPrefix']
    for label,data in rig.items():
        mesh=bpy.data.meshes.new(prefix+'-'+label); mesh.from_pydata(data['vertices'],[],data['faces']); mesh.update()
        for mat in mats: mesh.materials.append(mat)
        tint=mesh.color_attributes.new(name='TreasureTint',type='BYTE_COLOR',domain='CORNER')
        for face,color,index in zip(mesh.polygons,data['colors'],data['materials']):
            face.material_index=index
            for loop in face.loop_indices: tint.data[loop].color=color
        obj=bpy.data.objects.new(prefix+'-'+label,mesh); scene.collection.objects.link(obj); objects[name][label]=obj
        parent=data['parent']; obj.parent=objects[name][parent] if parent else roots[name]
        obj.location=xyz(data['pivot']-(rig[parent]['pivot'] if parent else Vector((0,0,0))))
    roots[name]['triangles']=sum(len(face)-2 for data in rig.values() for face in data['faces'])

# The goblin trips onto its side; the heavy sack tips over with it and settles.
rig=objects['lootGoblin']; clip='treasure-goblin-death'
for label,obj in rig.items():
    base=obj.location.copy()
    for frame,t in [(0,0),(5,.05),(11,.32),(19,.83),(25,1.025),(34,1),(42,1)]:
        rotation=(.65*t,0,1.35*t) if label=='body' else (-.15*t,0,-.10*t) if label=='sack' else (0,0,0)
        basis=Euler((math.pi/2,0,0)).to_matrix()
        obj.rotation_euler=(basis@Euler(rotation).to_matrix()@basis.transposed()).to_euler()
        obj.location=base+xyz((0,-.48*t,0) if label=='body' else (0,0,0))
        obj.keyframe_insert(data_path='rotation_euler',frame=frame); obj.keyframe_insert(data_path='location',frame=frame)
    action=obj.animation_data.action; action.name=clip+'-'+label
    for curve in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves:
        for key in curve.keyframe_points:key.interpolation='LINEAR'
    track=obj.animation_data.nla_tracks.new(); track.name=clip
    strip=track.strips.new(clip,0,action);strip.extrapolation='NOTHING'
    obj.animation_data.action=None; obj.location=base;obj.rotation_euler=(0,0,0)
action=bpy.data.actions[clip+'-body']
height=next(c for c in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves if c.data_path=='location' and c.array_index==2)
values=[]
for frame in range(43):
    scene.frame_set(frame);bpy.context.view_layer.update()
    bottom=min((obj.matrix_world@v.co).z for obj in rig.values() for v in obj.data.vertices)
    values.append(height.evaluate(frame)-bottom+.008*min(1,frame/11))
height.keyframe_points.clear()
for frame,value in enumerate(values):height.keyframe_points.insert(frame,value).interpolation='LINEAR'
height.update();scene.frame_set(0)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,
    export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',
    export_force_sampling=True,export_cameras=False,export_lights=False)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)

if '--render' in sys.argv:
    # Review the exported meshes by importing the actual GLB into a new scene.
    gallery=bpy.data.scenes.new('Exported GLB review');bpy.context.window.scene=gallery
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(EXPORT))
    imported=set(bpy.data.objects)-before
    rendered={name:next(obj for obj in imported if obj.name.split('.')[0]==name) for name in roots}
    for obj in imported:
        if obj.animation_data:obj.animation_data_clear()
    for name,obj in rendered.items():
        obj.location=xyz({'lootGoblin':(-2.25,0,0),'shadyMerchant':(0,0,0),'goblinPortal':(2.9,0,-.15),'mossVoucher':(.35,.75,1.4)}[name])
        if name=='mossVoucher': obj.scale=(.6,.6,.6)
    gallery.render.engine='CYCLES';gallery.cycles.samples=24;gallery.cycles.use_denoising=True
    gallery.render.resolution_x=1800;gallery.render.resolution_y=1000;gallery.render.resolution_percentage=100
    gallery.render.image_settings.file_format='PNG';gallery.render.image_settings.color_mode='RGBA'
    gallery.world=bpy.data.worlds.new('Treasure review world');gallery.world.use_nodes=True
    gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.11,.15,.16,1)
    gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
    gallery.view_settings.view_transform='AgX'
    def aim(obj,point):obj.rotation_euler=(xyz(point)-obj.location).to_track_quat('-Z','Y').to_euler()
    def area(name,position,power,size,color):
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
        obj=bpy.data.objects.new(name,data);gallery.collection.objects.link(obj);obj.location=xyz(position);aim(obj,(0,1,0))
    area('Warm key',(-3,6,6),900,7,(1,.86,.68));area('Cool fill',(5,4,3),650,5,(.65,.87,1));area('Rim',(-2,5,-4),1000,4,(.69,1,.86))
    data=bpy.data.cameras.new('Treasure review camera');camera=bpy.data.objects.new('Treasure review camera',data)
    gallery.collection.objects.link(camera);gallery.camera=camera;data.type='ORTHO';data.ortho_scale=9.2
    camera.location=xyz((5,4.6,11));aim(camera,(.30,1.08,0))
    floor_material=bpy.data.materials.new('Gallery floor');floor_material.diffuse_color=rgba('263D40')
    bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.data.materials.append(floor_material)
    floor.location.z=-.025
    gallery.render.filepath=str(PREVIEW);bpy.ops.render.render(write_still=True)
    # The inventory icon is another Blender render of the exported voucher.
    for obj in imported: obj.hide_render=obj not in [rendered['mossVoucher'],*rendered['mossVoucher'].children_recursive]
    floor.hide_render=True;voucher=rendered['mossVoucher'];voucher.location=(0,0,0);voucher.scale=(1,1,1)
    camera.location=xyz((1.4,1.35,5));aim(camera,(0,.43,0));data.ortho_scale=1.25
    gallery.render.resolution_x=256;gallery.render.resolution_y=256;gallery.render.film_transparent=True
    gallery.render.filepath=str(ICON);bpy.ops.render.render(write_still=True)
    # Leave the retained source on a useful review scene with all models visible.
    for obj in imported:obj.hide_render=False
    floor.hide_render=False;voucher.location=xyz((.35,.75,1.4));voucher.scale=(.6,.6,.6)
    camera.location=xyz((5,4.6,11));aim(camera,(.30,1.08,0));data.ortho_scale=9.2
    gallery.render.resolution_x=1800;gallery.render.resolution_y=1000;gallery.render.film_transparent=False
    gallery.render.filepath=str(PREVIEW)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('TREASURE ASSETS:',EXPORT,PREVIEW,ICON)
