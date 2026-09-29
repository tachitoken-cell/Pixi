"""Four Mossvale deed cottages and two auction merchants, authored in Blender.

Reuses the existing walkable shell/interior and four-part NPC rig. Export Y up,
+Z front; preserve the 10x9m footprint and unobstructed 2.8m doorway.
Blender --background --python scripts/build-deed-assets.py -- --render
"""
import bpy
import math
import random
import subprocess
import sys
import tempfile
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/deed-cottages-merchants.blend'
EXPORT = ROOT / 'public/models/deed-cottages-merchants.glb'
PREVIEW = ROOT / 'assets/source/deed-cottages-merchants-preview.png'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
library = bpy.context.scene
library.name = 'Mossvale deed cottages and merchants - game library'
library.unit_settings.system = 'METRIC'

def xyz(x, y, z): return (x, -z, y)
def linear(x): return x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4
def rgba(hexcode): return tuple(linear(int(hexcode[i:i+2], 16) / 255) for i in (0, 2, 4)) + (1,)
materials = {}
def material(hexcode):
    if hexcode not in materials:
        mat = bpy.data.materials.new('Deed palette ' + hexcode)
        mat.diffuse_color = rgba(hexcode)
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = rgba(hexcode)
        shader.inputs['Roughness'].default_value = .83
        materials[hexcode] = mat
    return materials[hexcode]

def load_root(file, name):
    with bpy.data.libraries.load(str(file), link=False) as (available, loaded):
        loaded.objects = list(available.objects)
    return next(obj for obj in loaded.objects if obj and obj.name == name)

def clone(source, name, parent=None):
    obj = source.copy()
    if source.data: obj.data = source.data.copy()
    library.collection.objects.link(obj)
    obj.name = name
    obj.parent = parent
    for child in source.children:
        clone(child, name + '-' + child.get('part', child.name), obj)
    return obj

def descendants(root):
    for child in root.children:
        yield child
        yield from descendants(child)

def tint(root, replacements):
    table = [(rgba(old), rgba(new)) for old, new in replacements.items()]
    for obj in descendants(root):
        if obj.type != 'MESH': continue
        for attr in obj.data.color_attributes:
            for item in attr.data:
                old = tuple(item.color)
                for expected, replacement in table:
                    if max(abs(old[i] - expected[i]) for i in range(3)) < .008:
                        item.color = replacement
                        break

pieces = []
def box(color, x, y, z, w, h, d, turn=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(x, y, z))
    obj = bpy.context.object
    obj.scale = (w, d, h)
    obj.rotation_euler.z = -turn
    obj.data.materials.append(material(color))
    pieces.append(obj)
    return obj

def leaf(color, x, y, z, scale=.14):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=xyz(x, y, z))
    obj = bpy.context.object
    obj.scale = (scale, scale * .45, scale * .7)
    obj.data.materials.append(material(color))
    pieces.append(obj)
    return obj

def finish_part(root, name):
    if not pieces: return
    bpy.ops.object.select_all(action='DESELECT')
    for obj in pieces: obj.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = root.name + '-' + name
    obj['part'] = name
    obj.parent = root
    pieces.clear()

base_house = load_root(ROOT / 'assets/source/house-interiors.blend', 'house-city-cottage')
base_merchant = load_root(ROOT / 'assets/source/city-kit.blend', 'city-auctioneer')
roots = []
for index in range(1, 5):
    rng = random.Random(730 + index)
    root = clone(base_house, f'deed-house-greenwood-{index}')
    root['deedId'] = index
    root['referenceCard'] = f'/nfts/houses/{index}.png'
    root['contract'] = '10x9m walkable cottage, original open doorway and furniture, named directional cutaway parts'
    roots.append(root)
    greens = [('385B39', '71834B', '253E2D'), ('416147', '819359', '2B4030'),
              ('4C633A', '89914A', '30452D'), ('315749', '688C71', '203D35')][index-1]
    tint(root, {'36746A': greens[0], '568F77': greens[1], '28534E': greens[2],
                '6DA9AD': 'E9B65F', '447E75': greens[0]})
    # Moss and flowering ivy remain part of the wall cutaway, outside the entry.
    for side in [-1, 1]:
        for step in range(21):
            y = .35 + step * .235
            x = side * (4.35 + math.sin(step * .65 + index) * .23)
            z = 4.74
            box('53653C', x, y, z, .055, .32, .06, math.sin(step) * .3)
            for k in range(3):
                xx, yy = x + rng.uniform(-.24, .24), y + rng.uniform(-.12, .15)
                leaf(greens[k], xx, yy, z + .035, rng.uniform(.12, .21))
                if (step + k + index) % 5 == 0:
                    leaf('E9DFC0' if index != 3 else 'D2A65C', xx, yy + .05, z + .12, .07)
        # Low planters sit against the solid wall, leaving the full doorway clear.
        x, z = side * 3.65, 4.30
        box('77543B' if index != 3 else 'B06D47', x, .28, z, .86, .55, .52)
        box('AA8154', x, .57, z, .96, .12, .60)
        box('3D3929', x, .63, z, .81, .04, .47)
        for k in range(9):
            xx, zz = x + rng.uniform(-.35, .35), z + rng.uniform(-.18, .18)
            leaf(greens[k % 3], xx, .76 + rng.random() * .20, zz, .18)
            if k % 2 == 0: leaf('DDD7AD' if index != 3 else 'D7A750', xx, .97, zz, .085)
    finish_part(root, 'shell-front-deed-garden')
    # A carved porch lintel, crest and lamps distinguish each deed without blocking entry.
    for side in [-1, 1]:
        x, z = side * 1.82, 4.63
        box('59402D', x, 3.9, z, .16, .60, .19)
        box('C2A360', x, 3.61, z, .37, .08, .35)
        box('F0C574', x, 3.39, z, .25, .38, .23)
        box('4D4434', x, 3.16, z, .37, .08, .35)
        for dx in [-.145, .145]: box('5D5239', x + dx, 3.39, z + .145, .04, .40, .04)
    box('65482E', 0, 4.1, 4.64, 3.75, .20, .36)
    box('B99755', 0, 4.13, 4.84, .44, .33, .06)
    for mark in range(index): box('244635', -.13 * (index-1) + mark * .26, 4.13, 4.88, .065, .19, .04)
    finish_part(root, 'shell-front-deed-lanterns')
    # Roof moss follows the existing 5.5m eave / 3.65m pitch; no floating foliage.
    for side in [-1, 1]:
        for k in range(64):
            x = side * rng.uniform(.6, 5.0)
            z = rng.uniform(-4.5, 4.5)
            y = 9.15 - abs(x) / 5.0 * 3.65 + .10
            leaf(greens[k % 3], x, y, z, rng.uniform(.12, .26))
    finish_part(root, 'roof-deed-moss')
    # Card 2 gets a pale timber shutter treatment; card 3 autumn foliage; card 4 deeper green.
    if index == 2: tint(root, {'B08252': 'BCAA83'})
    if index == 3:
        for k in range(18):
            leaf('B18B43', rng.uniform(3.3, 4.5), rng.uniform(3.0, 4.7), 4.84, .17)
        finish_part(root, 'shell-front-autumn-leaves')

for name, coat, accent in [('merchant-deed-auctioneer', '345F45', 'C8A95F'), ('merchant-auctioneer', '714A3F', 'C3A15C')]:
    root = clone(base_merchant, name)
    roots.append(root)
    root['contract'] = 'Four-part animated merchant: body, head, left-arm, right-arm. Metres, Y up, +Z front.'
    tint(root, {'9C4F54': coat, 'C56B57': coat, 'DFB35F': accent, '36746A': '2F543F'})
    for child in root.children:
        part = child.get('part', child.name.split('-')[-1])
        child.name = name + '-' + part
    # Deedkeeper carries a rolled deed with a moss wax seal; the auctioneer retains his gavel.
    if name == 'merchant-deed-auctioneer':
        arm = next(obj for obj in root.children if obj.get('part') == 'left-arm')
        box('E8D9AF', -.49, .90, .31, .33, .42, .09)
        for yy in [.70, 1.10]: box('B69A65', -.49, yy, .33, .39, .07, .13)
        leaf('315941', -.49, .88, .40, .10)
        finish_part(root, 'deed-scroll')
        scroll = next(obj for obj in root.children if obj.get('part') == 'deed-scroll')
        matrix = scroll.matrix_world.copy()
        scroll.parent = arm
        scroll.matrix_world = matrix

SOURCE.parent.mkdir(parents=True, exist_ok=True)
EXPORT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
for root in roots:
    root.select_set(True)
    for child in descendants(root): child.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(EXPORT), export_format='GLB', use_selection=True,
    export_yup=True, export_apply=True, export_animations=False, export_cameras=False,
    export_lights=False, export_extras=True)
if '--optimize' in sys.argv:
    cli = ['npx', '--yes', '@gltf-transform/cli@4.5.0']
    with tempfile.TemporaryDirectory(prefix='mossvale-deeds-') as temporary:
        steps = [str(EXPORT)] + [str(Path(temporary) / f'{i}.glb') for i in range(3)]
        for command in [['weld', steps[0], steps[1]],
                        ['quantize', steps[1], steps[2], '--pattern', '{NORMAL,COLOR_*}', '--quantize-normal', '8', '--quantize-color', '8'],
                        ['dedup', steps[2], steps[3]], ['prune', steps[3], steps[0]]]:
            subprocess.run(cli + command, check=True)

gallery = bpy.data.scenes.new('Four deed cottages - merchant showcase')
bpy.context.window.scene = gallery
for index, source in enumerate(roots):
    group = source.copy()
    gallery.collection.objects.link(group)
    at = [(-8, 0, -8), (8, 0, -8), (-8, 0, 8), (8, 0, 8), (-2, 0, 20), (2, 0, 20)][index]
    group.location = xyz(*at)
    if index >= 4: group.scale = (2.5, 2.5, 2.5)
    def instance_children(original, target):
        for child in original.children:
            obj = child.copy()
            gallery.collection.objects.link(obj)
            obj.parent = target
            instance_children(child, obj)
    instance_children(source, group)
bpy.ops.mesh.primitive_plane_add(size=130, location=(0, 0, -.10))
bpy.context.object.data.materials.append(material('263C30'))
bpy.context.object.name = 'Gallery ground - not exported'
def aim(obj, target): obj.rotation_euler = (Vector(xyz(*target)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add(location=xyz(31, 35, 48))
camera = bpy.context.object
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 49
aim(camera, (0, 3, 2))
gallery.camera = camera
for at, power, size in [((-18, 25, 20), 7000, 14), ((18, 20, 5), 5500, 12)]:
    bpy.ops.object.light_add(type='AREA', location=xyz(*at))
    light = bpy.context.object
    light.data.energy, light.data.shape, light.data.size = power, 'DISK', size
    aim(light, (0, 2, 0))
bpy.ops.object.light_add(type='SUN', location=xyz(-10, 20, 15))
bpy.context.object.data.energy = 2
bpy.context.object.data.angle = .18
aim(bpy.context.object, (0, 0, 0))
gallery.world = bpy.data.worlds.new('Mossvale woodland sky')
gallery.world.use_nodes = True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.20, .25, .23, 1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .5
gallery.render.engine = 'CYCLES'
gallery.cycles.samples = 24
gallery.cycles.use_denoising = True
gallery.render.resolution_x, gallery.render.resolution_y = 1800, 1600
gallery.render.resolution_percentage = 100
gallery.render.image_settings.file_format = 'PNG'
gallery.render.filepath = str(PREVIEW)
gallery.view_settings.view_transform = 'AgX'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)
print('DEED_ASSETS', {'roots': [root.name for root in roots], 'glbBytes': EXPORT.stat().st_size})
if '--render' in sys.argv: bpy.ops.render.render(write_still=True)
