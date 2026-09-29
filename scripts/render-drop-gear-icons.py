"""Render per-item inventory art and named/stat-labelled review sheets in Blender.

/Applications/Blender.app/Contents/MacOS/Blender --background assets/source/gear-kit.blend --python scripts/render-drop-gear-icons.py
Add -- --sample for a two-icon preview, or -- --sheets-only after a catalog-only name/stat edit. The runtime meshes and
gear-kit.blend are never modified. Level stamps are icon UI, not wearable geometry.
"""
import bpy
import hashlib
import json
import math
import struct
import subprocess
import sys
import textwrap
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / 'public/ui/gear'
ART = ROOT / 'assets/source'
def read_catalog():
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {GEAR} from './src/progression.ts'; console.log(JSON.stringify(Object.values(GEAR).filter(item=>item.dropOnly)));"], cwd=ROOT))

catalog = read_catalog()
assert len(catalog) == len({item['id'] for item in catalog}) == 128
assert len({item['model'] for item in catalog}) == 64
sources = {item['model']: bpy.data.objects[item['model']] for item in catalog}

# Retain only the actual drop meshes as editable source; fitted runtime models
# remain in gear-kit.blend and are irrelevant to an isolated inventory thumbnail.
library = bpy.data.scenes.new('64 original wearable meshes')
bpy.context.window.scene = library
keep = set()
for root in sources.values():
    keep.update([root, *root.children])
for obj in keep:
    library.collection.objects.link(obj)
for scene in list(bpy.data.scenes):
    if scene != library:
        bpy.data.scenes.remove(scene)
for obj in list(bpy.data.objects):
    if obj not in keep:
        bpy.data.objects.remove(obj, do_unlink=True)
bpy.data.orphans_purge(do_recursive=True)

def xyz(x, y, z):
    return x, -z, y

def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat('-Z', 'Y').to_euler()

def emission(name, color):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    shader = nodes.new('ShaderNodeEmission')
    shader.inputs['Color'].default_value = color
    material.node_tree.links.new(shader.outputs[0], output.inputs['Surface'])
    return material

def rgb(value):
    values = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values) + (1,)

materials = {name: emission(name, rgb(value)) for name, value in {
    'paper': 'ECE6D5', 'muted': 'A5B2AE', 'common': 'C2C5BE', 'uncommon': '89CC9B',
    'ink': '122026', 'chip': '22322F', 'background': '17292F', 'rule': '354A4F',
}.items()}

def plane(scene, name, at, width, height, material, parent=None, chamfer=0):
    x, y = width / 2, height / 2
    points = [(-x + chamfer, -y), (x - chamfer, -y), (x, -y + chamfer), (x, y - chamfer),
              (x - chamfer, y), (-x + chamfer, y), (-x, y - chamfer), (-x, -y + chamfer)]
    if not chamfer:
        points = [(-x, -y), (x, -y), (x, y), (-x, y)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(px, py, 0) for px, py in points], [], [tuple(range(len(points)))])
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = at
    return obj

def label(scene, name, text, at, size, material, parent=None, align='CENTER'):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = text
    curve.align_x = align
    curve.align_y = 'CENTER'
    curve.size = size
    curve.space_line = 1.05
    curve.materials.append(material)
    obj = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = at
    return obj

scene = bpy.data.scenes.new('128 individual inventory icons')
bpy.context.window.scene = scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.compression = 100
scene.render.film_transparent = True
scene.view_settings.view_transform = 'AgX'
scene.world = bpy.data.worlds.new('Soft inventory light')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.17, .20, .22, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .8
for at, power, size in [((-3, 5, 6), 550, 5), ((4, 3, 1), 350, 4)]:
    bpy.ops.object.light_add(type='AREA', location=xyz(*at))
    light = bpy.context.object
    light.data.energy = power
    light.data.shape = 'DISK'
    light.data.size = size
    aim(light, xyz(0, 1, 0))
bpy.ops.object.camera_add()
camera = bpy.context.object
camera.name = 'Inventory camera and level stamp'
camera.data.type = 'ORTHO'
scene.camera = camera

sample = '--sample' in sys.argv
output = Path('/tmp/mossvale-drop-icon-samples') if sample else ICONS
output.mkdir(parents=True, exist_ok=True)
if '--sheets-only' not in sys.argv:
    for item in catalog:
        if sample and item['id'] not in ['drop-ranger-common-1-weapon', 'drop-ranger-common-8-weapon']:
            continue
        before = set(scene.objects)
        offsets = [-.20, .20] if item['slot'] in ['legs', 'shoes'] else [0]
        for offset in offsets:
            for source in sources[item['model']].children:
                obj = source.copy()
                obj.data = source.data
                obj.parent = None
                scene.collection.objects.link(obj)
                if source.name.endswith('left-arm'):
                    obj.location = xyz(.47, 1.44, 0)
                elif source.name.endswith('right-arm'):
                    obj.location = xyz(-.47, 1.44, 0)
                obj.location.x += offset
        objects = set(scene.objects) - before
        bpy.context.view_layer.update()
        corners = [obj.matrix_world @ Vector(p) for obj in objects if obj.type == 'MESH' for p in obj.bound_box]
        lower = Vector(tuple(min(p[i] for p in corners) for i in range(3)))
        upper = Vector(tuple(max(p[i] for p in corners) for i in range(3)))
        center = (lower + upper) / 2
        extent = max(upper - lower) * 1.46
        higher = item['requiredLevel'] >= 8
        side = -1 if higher else 1
        back = -1 if item['slot'] == 'back' else 1
        view = (side * 3.7, 2.8 if higher else 2.15, back * 6)
        if item['className'] == 'Ranger' and item['slot'] == 'weapon':
            view = (6, 2.6 if higher else 2.0, -1.5 if higher else 1.5)
        elif item['slot'] == 'ring':
            view = (side * 3.4, 4.3, 6)
        camera.location = center + Vector(xyz(*view))
        aim(camera, center)
        camera.data.ortho_scale = extent
        camera.location += camera.rotation_euler.to_quaternion() @ Vector((0, -.035 * extent, 0))
        quality = materials[item['quality']]
        plane(scene, 'Level stamp border', (extent * .375, -extent * .375, -1.50), extent * .172, extent * .172, quality, camera, extent * .018)
        plane(scene, 'Level stamp inset', (extent * .375, -extent * .375, -1.49), extent * .146, extent * .146, materials['chip'], camera, extent * .012)
        label(scene, 'Required level', str(item['requiredLevel']), (extent * .375, -extent * .377, -1.48), extent * .098, quality, camera)
        scene.render.filepath = str(output / (item['id'] + '.png'))
        bpy.ops.render.render(write_still=True)
        if sample:
            small = bpy.data.images.load(scene.render.filepath)
            small.scale(32, 32)
            small.filepath_raw = str(output / (item['id'] + '-32px.png'))
            small.save()
        for obj in set(scene.objects) - before:
            bpy.data.objects.remove(obj, do_unlink=True)

if sample:
    print('Sample icons saved in ' + str(output), flush=True)
    sys.exit(0)

paths = [ICONS / (item['id'] + '.png') for item in catalog]
assert len({hashlib.sha256(path.read_bytes()).digest() for path in paths}) == 128, 'every item has individually rendered art'
assert all(struct.unpack_from('>II', path.read_bytes(), 16) == (256, 256) for path in paths)

# Names and balance may be refined during the icon render; captions use current data.
current_catalog = read_catalog()
assert {item['id'] for item in current_catalog} == {item['id'] for item in catalog}
catalog = current_catalog

def image_material(path):
    material = bpy.data.materials.new(path.stem + ' inventory image')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images.load(str(path), check_existing=True)
    output = nodes.new('ShaderNodeOutputMaterial')
    color = nodes.new('ShaderNodeEmission')
    clear = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    for source, target in [(texture.outputs['Color'], color.inputs['Color']), (texture.outputs['Alpha'], mix.inputs[0]),
                           (clear.outputs[0], mix.inputs[1]), (color.outputs[0], mix.inputs[2]), (mix.outputs[0], output.inputs['Surface'])]:
        material.node_tree.links.new(source, target)
    return material

slots = ['weapon', 'armor', 'head', 'legs', 'shoes', 'back', 'charm', 'ring']
for calling in ['Ranger', 'Knight', 'Mage', 'Cleric']:
    review = bpy.data.scenes.new(calling + ' names and stats')
    bpy.context.window.scene = review
    review.render.engine = 'CYCLES'
    review.cycles.samples = 1
    review.render.resolution_x, review.render.resolution_y = 2048, 1720
    review.render.resolution_percentage = 100
    review.render.image_settings.file_format = 'PNG'
    review.render.image_settings.color_mode = 'RGBA'
    review.render.image_settings.compression = 100
    review.view_settings.view_transform = 'Standard'
    bpy.ops.object.camera_add(location=(0, 0, 20))
    review.camera = bpy.context.object
    review.camera.data.type = 'ORTHO'
    review.camera.data.ortho_scale = 20
    plane(review, 'Sheet background', (0, 0, -1), 20, 18, materials['background'])
    label(review, 'Mossvale', 'M O S S V A L E  /  ' + calling.upper(), (0, 7.66, .1), .27, materials['paper'])
    label(review, 'Inventory catalog', '32 named drops', (0, 7.17, .1), .42, materials['paper'])
    label(review, 'Stat key', 'ATK = primary damage    SKILL = special damage    DEF = defense', (0, 6.67, .1), .17, materials['muted'])
    for row, level in enumerate([1, 3, 8, 10]):
        group = [item for item in catalog if item['className'] == calling and item['requiredLevel'] == level]
        quality = group[0]['quality']
        y = 5.79 - row * 3.48
        label(review, 'Drop group', quality.upper() + '  /  LEVEL ' + str(level), (-9.3, y + .14, .1), .22, materials[quality], align='LEFT')
        plane(review, 'Group rule', (0, y - .12, -.2), 18.6, .015, materials['rule'])
        for column, slot in enumerate(slots):
            item = next(item for item in group if item['slot'] == slot)
            x = (column - 3.5) * 2.34
            bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y - 1.24, 0))
            card = bpy.context.object
            card.name = item['id'] + ' exact inventory art'
            card.scale = (1.91, 1.91, 1)
            card.data.materials.append(image_material(ICONS / (item['id'] + '.png')))
            label(review, item['id'] + ' name', textwrap.fill(item['label'], width=22), (x, y - 2.45, .1), .182, materials['paper'])
            stats = '  '.join(f'{short} +{item["stats"][key]}' for key, short in [('primaryDamage', 'ATK'), ('specialDamage', 'SKILL'), ('defense', 'DEF')] if item['stats'].get(key))
            label(review, item['id'] + ' stats', stats, (x, y - 2.94, .1), .149, materials[quality])
    review.render.filepath = str(ART / ('drop-gear-icons-' + calling.lower() + '.png'))
    bpy.ops.render.render(write_still=True)

metadata = bpy.data.texts.new('Rendered item names and stats.json')
metadata.write(json.dumps(catalog, indent=2))
bpy.context.window.scene = bpy.data.scenes['Ranger names and stats']
bpy.ops.file.pack_all()
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ART / 'drop-gear-icons.blend'), compress=True)
print('DROP_ICONS ' + json.dumps({'icons': len(paths), 'distinct': 128, 'size': 256, 'review_sheets': 4}), flush=True)
