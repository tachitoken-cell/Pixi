"""Author the four MOSS store companions in Blender, preserving the existing rigs.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-store-assets.py -- --render
Reuses Mossvale's original anatomy; new fire crests, armor, wings and twin tails
are authored as geometry here. No downloaded art or external textures.
"""
import bpy
import colorsys
import json
import math
import shutil
import struct
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / 'public/models/store-collection.glb'
SOURCE = ROOT / 'assets/source/store-collection.blend'
PREVIEW = ROOT / 'assets/source/store-collection-preview.png'
for path in [EXPORT.parent, SOURCE.parent, ROOT / 'public/ui/pets', ROOT / 'public/ui/store']:
    path.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def xyz(p): return Vector((p[0], -p[2], p[1]))
def linear(v): return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
def rgba(hex): return tuple(linear(int(hex[i:i+2], 16) / 255) for i in (0, 2, 4)) + (1,)
def material(name, color, metal=0, glow=0):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = rgba(color)
    shader.inputs['Roughness'].default_value = .6
    shader.inputs['Metallic'].default_value = metal
    if glow:
        shader.inputs['Emission Color'].default_value = rgba(color)
        shader.inputs['Emission Strength'].default_value = glow
    return mat

gold = material('Burnished gold', 'DAA052', .75)
charcoal = material('Obsidian armor', '292834', .6)
flame = material('Molten flame', 'FF8134', 0, .7)
hot = material('Flame heart', 'FFE4A2', 0, .5)

def tree(root): return [root, *root.children_recursive]
def import_models(path, wanted):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / path))
    added = set(bpy.data.objects) - before
    roots = {name: next(obj for obj in added if obj.name == name) for name in wanted}
    keep = {obj for root in roots.values() for obj in tree(root)}
    for obj in added - keep: bpy.data.objects.remove(obj, do_unlink=True)
    return roots

mounts = import_models('public/models/mounts.glb', ['mount-horse', 'mount-wolf'])
pets = import_models('public/models/pets.glb', ['ember-drake', 'moss-fox'])
specs = [
    (mounts['mount-horse'], 'horse', 'store-embermane', 'EMBERMANE', '/ui/mount-store-embermane.png'),
    (mounts['mount-wolf'], 'wolf', 'store-cinderfang', 'CINDERFANG', '/ui/mount-store-cinderfang.png'),
    (pets['ember-drake'], 'ember-drake', 'store-ashwing', 'ASHWING', '/ui/pets/store-ashwing.png'),
    (pets['moss-fox'], 'moss-fox', 'store-cinder-kit', 'CINDER KIT', '/ui/pets/store-cinder-kit.png'),
]

def recolor(root, kind):
    # Keep original face variation and readable eyes while giving each new model
    # its own palette. Imported glTF attributes contain linear vertex colors.
    for obj in tree(root):
        if obj.type != 'MESH': continue
        obj.data = obj.data.copy()
        for attr in obj.data.color_attributes:
            for entry in attr.data:
                r, g, b, a = entry.color
                hue, saturation, value = colorsys.rgb_to_hsv(r, g, b)
                if value < .04: tint = '201D29'
                elif kind == 'store-cinder-kit':
                    tint = 'FFF0C3' if saturation < .45 and value > .4 else 'FFB053' if value > .4 else 'E97337' if value > .15 else '713934'
                elif saturation < .30 and value > .35: tint = 'EBBA79'
                elif .09 < hue < .18 and value > .35: tint = 'FFB955'
                elif value > .45: tint = 'C66B43'
                elif value > .20: tint = '55404A'
                else: tint = '302D3B'
                entry.color = rgba(tint)

for root, old, new, label, icon in specs:
    root['storeOnly'] = True; root['displayName'] = label.title()
    root['title'] = label
    root['baseRig'] = old; root['authoredWith'] = 'Blender'
    for obj in tree(root): obj.name = obj.name.replace(old, new)
    recolor(root, new)

def joint(root, suffix): return next(obj for obj in tree(root) if obj.name == root.name.removeprefix('mount-') + '-' + suffix)

def mesh_on(parent, name, vertices, faces, mat):
    bpy.context.view_layer.update()
    inverse = parent.matrix_world.inverted()
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([inverse @ xyz(p) for p in vertices], [], faces)
    mesh.materials.append(mat); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    return obj

def block(parent, name, center, size, mat):
    x,y,z=center; w,h,d=size
    return mesh_on(parent, name, [(x+a*w/2,y+b*h/2,z+c*d/2) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],
        [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)], mat)

def spike(parent, name, a, b, width, mat):
    a,b=Vector(a),Vector(b); axis=(b-a).normalized()
    side=axis.cross(Vector((0,0,1)) if abs(axis.z)<.9 else Vector((0,1,0))).normalized()*width
    across=axis.cross(side)
    vertices=[a+side,a+across,a-side,a-across,b]
    return mesh_on(parent,name,vertices,[(0,3,2,1),(0,1,4),(1,2,4),(2,3,4),(3,0,4)],mat)

def fire_crest(parent, name, a, height, width):
    x,y,z=a
    spike(parent,name+'-outer',(x,y,z),(x+width*.4,y+height,z-width*.3),width,flame)
    spike(parent,name+'-core',(x,y+.015,z+width*.7),(x-width*.10,y+height*.72,z+width*.55),width*.52,hot)

horse,wolf,drake,fox=[spec[0] for spec in specs]
# Embermane: raised flame mane, gilded chest armor, fire shoes and a comet tail.
for i in range(7):
    fire_crest(joint(horse,'head'),f'embermane-mane-{i}',(0,1.75+i*.12,.59+i*.06),.28+i*.025,.10)
for side in (-1,1):
    for i in range(3):
        block(joint(horse,'body'),f'embermane-armor-{side}-{i}',(side*.55,1.5-i*.15,.72),(.16,.18,.56-i*.08),charcoal)
        block(joint(horse,'body'),f'embermane-gold-{side}-{i}',(side*.64,1.53-i*.15,.73),(.025,.04,.43-i*.07),gold)
    spike(joint(horse,'head'),f'embermane-horn-{side}',(side*.20,2.56,1.04),(side*.30,2.96,.85),.10,gold)
    fire_crest(joint(horse,'head'),f'embermane-crown-{side}',(side*.30,2.88,.87),.24,.06)
for name in ['front-left','front-right','rear-left','rear-right']:
    limb=joint(horse,name+'-knee'); pos=limb.matrix_world.translation
    # The authored pivot remains untouched; the flame follows the hoof joint.
    x=pos.x; z=-pos.y
    fire_crest(limb,'embermane-hoof-'+name,(x,.14,z),.38,.12)
for i in range(4): fire_crest(joint(horse,'tail'),f'embermane-tail-{i}',((i-1.5)*.11,.83,-1.50),.38+(.16 if i in [1,2] else 0),.09)

# Cinderfang: a wide armored ruff and ember crown give a different silhouette.
for side in (-1,1):
    for i in range(5):
        a=(side*(.45+i*.016),1.54-i*.13,.66-i*.13)
        spike(joint(wolf,'body'),f'cinderfang-ruff-{side}-{i}',a,(side*(.91-i*.035),1.90-i*.16,.40-i*.17),.13,charcoal)
        fire_crest(joint(wolf,'body'),f'cinderfang-ruff-fire-{side}-{i}',(side*(.83-i*.033),1.79-i*.16,.44-i*.17),.22,.07)
    spike(joint(wolf,'head'),f'cinderfang-crown-{side}',(side*.23,2.10,1.16),(side*.53,2.65,.91),.13,gold)
    fire_crest(joint(wolf,'head'),f'cinderfang-crown-fire-{side}',(side*.48,2.51,.95),.28,.08)
    block(joint(wolf,'head'),f'cinderfang-brow-{side}',(side*.43,1.97,1.31),(.07,.045,.24),flame)
for i in range(4):
    fire_crest(joint(wolf,'tail'),f'cinderfang-tail-{i}',(0,1.51-i*.10,-1.21-i*.17),.30,.12)

# Ashwing: enlarged fire membrane, wingtip embers, a three-point crown and tail.
for side,label in [(-1,'left'),(1,'right')]:
    wing=joint(drake,'wing-'+label)
    mesh_on(wing,'ashwing-flame-web-'+label,[(side*.16,.54,-.05),(side*.46,1.03,-.16),(side*.85,.76,-.24),(side*.68,.48,-.15),(side*.48,.34,-.10),(side*.27,.35,-.055)],[(0,1,2),(0,2,3),(0,3,4),(0,4,5)],flame)
    for i in range(3):
        spike(wing,f'ashwing-wing-gold-{side}-{i}',(side*.17,.55,-.04),(side*(.47+i*.18),.96-i*.13,-.16-i*.04),.012,gold)
    fire_crest(wing,'ashwing-wingtip-'+label,(side*.83,.75,-.24),.18,.045)
for i in range(3): fire_crest(joint(drake,'head'),f'ashwing-crown-{i}',((i-1)*.07,.74,.21),.22 if i==1 else .15,.035)
for i in range(3): fire_crest(joint(drake,'tail'),f'ashwing-tail-{i}',(.18+i*.032,.36+i*.045,-.61),.14,.045)

# Cinder Kit: two plush flame tails and a little fire spirit on its brow.
tail=joint(fox,'tail')
for child in list(tail.children):
    twin=child.copy(); twin.data=child.data.copy(); bpy.context.scene.collection.objects.link(twin)
    twin.name=child.name+'-second'; twin.parent=tail
    for vertex in twin.data.vertices: vertex.co.x*=-1
for side in (-1,1):
    fire_crest(tail,'cinder-kit-tail-'+str(side),(side*.22,.61,-.52),.24,.08)
    block(joint(fox,'body'),'cinder-kit-collar-'+str(side),(side*.125,.48,.20),(.04,.045,.07),gold)
fire_crest(joint(fox,'head'),'cinder-kit-brow',(0,.73,.29),.13,.035)

# Consolidate added accents by rigid joint and material to bound draw calls.
for root,_,_,_,_ in specs:
    for parent in [obj for obj in tree(root) if obj.type != 'MESH']:
        groups={}
        for obj in parent.children:
            if obj.type=='MESH' and len(obj.data.materials)==1:
                groups.setdefault(obj.data.materials[0].name,[]).append(obj)
        for objects in groups.values():
            if len(objects)<2: continue
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects: obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            bpy.ops.object.join()

bpy.ops.object.select_all(action='DESELECT')
for root,_,_,_,_ in specs:
    for obj in tree(root): obj.select_set(True)
    bpy.context.view_layer.update()
    points=[obj.matrix_world @ Vector(corner) for obj in tree(root) if obj.type=='MESH' for corner in obj.bound_box]
    root['height']=max(point.z for point in points)-min(point.z for point in points)
    root['width']=max(point.x for point in points)-min(point.x for point in points)
    root['triangles']=sum(len(face.vertices)-2 for obj in tree(root) if obj.type=='MESH' for face in obj.data.polygons)
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
raw=EXPORT.read_bytes(); length=struct.unpack_from('<I',raw,12)[0]; doc=json.loads(raw[20:20+length])
assert len(doc['scenes'][0]['nodes'])==4 and not doc.get('images')
assert len(raw)<3_000_000

def aim(obj,at): obj.rotation_euler=(xyz(at)-obj.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene; scene.name='MOSS store collection'
scene.world=bpy.data.worlds.new('Store studio'); scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.14,.17,.23,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=True
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'
for at,power,size in [((-4,7,5),700,5),((5,4,-5),1000,4)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(at));lamp=bpy.context.object
    lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size;aim(lamp,(0,1,0))
bpy.ops.object.camera_add(location=xyz((5,3.5,7)));camera=bpy.context.object;camera.data.type='ORTHO';scene.camera=camera
bpy.context.preferences.filepaths.save_version=0
if '--render' in sys.argv:
    scene.render.film_transparent=True
    for selected,old,new,label,icon in specs:
        for root,_,_,_,_ in specs:
            for obj in tree(root): obj.hide_render=root!=selected
        mount=old in ['horse','wolf']
        scene.render.resolution_x=512;scene.render.resolution_y=512
        camera.data.ortho_scale=4.6 if mount else 2.05
        aim(camera,(0,1.43 if mount else .52,-.02))
        scene.render.filepath=str(ROOT/'public'/icon.lstrip('/'));bpy.ops.render.render(write_still=True)
        shutil.copyfile(scene.render.filepath, ROOT/'public/ui/store'/f'{new}.png')
    # Title crest is also authored in Blender and retained in the source scene.
    for root,_,_,_,_ in specs:
        for obj in tree(root): obj.hide_render=True
    crest=bpy.data.objects.new('burned-title-crest',None);scene.collection.objects.link(crest)
    vertices=[]
    for radius in [.87,.94]:
        vertices.extend((math.sin(i*math.tau/32)*radius,.94+math.cos(i*math.tau/32)*radius,0) for i in range(32))
    mesh_on(crest,'burned-gold-ring',vertices,[(i,(i+1)%32,(i+1)%32+32,i+32) for i in range(32)],gold)
    outline=[(-.44,.37),(-.54,.70),(-.33,1.10),(-.30,.91),(-.07,1.33),(-.13,1.71),(.19,1.48),(.35,1.16),(.28,.95),(.45,1.18),(.54,.73),(.42,.39),(.12,.24),(-.15,.24)]
    mesh_on(crest,'burned-flame',[(x,y,.04) for x,y in outline],[tuple(range(len(outline)))],flame)
    outline=[(-.16,.39),(-.28,.62),(-.15,.91),(-.08,.76),(.08,1.14),(.20,.82),(.28,.56),(.17,.36),(0,.30)]
    mesh_on(crest,'burned-flame-heart',[(x,y,.065) for x,y in outline],[tuple(range(len(outline)))],hot)
    camera.location=xyz((0,.94,5));camera.data.ortho_scale=2.25;aim(camera,(0,.94,0))
    scene.render.filepath=str(ROOT/'public/ui/store/burned.png');bpy.ops.render.render(write_still=True)
    for obj in tree(crest): obj.hide_render=True
    for i,(root,old,new,label,icon) in enumerate(specs):
        for obj in tree(root): obj.hide_render=False
        root.location=xyz(([-3.3,1.0,-2.6,2.3][i],0,0 if i<2 else 2.6))
        if i>=2: root.scale=(1.5,)*3
    scene.render.film_transparent=False
    scene.render.resolution_x=1800;scene.render.resolution_y=1000
    camera.location=xyz((6,6,12));camera.data.ortho_scale=11.5;aim(camera,(0,1.1,.5))
    bpy.ops.mesh.primitive_plane_add(size=200,location=xyz((0,-.035,0)))
    bpy.context.object.data.materials.append(material('Warm charcoal floor','201A23'))
    scene.render.filepath=str(PREVIEW);bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('STORE COLLECTION '+json.dumps({'bytes':len(raw),'models':[new for _,_,new,_,_ in specs],'source':str(SOURCE),'preview':str(PREVIEW)}))
