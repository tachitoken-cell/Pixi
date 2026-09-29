"""Render Mossvale's small merchant wallet emblem from editable Blender geometry.

Rebuild from the repository root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-merchant-emblem.py

The transparent 256 px render is composed for a 64 px footer decoration. No
words, frame, portrait or UI values are baked into the image.
"""
import bpy
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/ui/merchant-emblem.png'
SOURCE = ROOT / 'assets/source/merchant-emblem.blend'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def material(name, color, roughness=.65, metallic=0):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    rgb = tuple(linear(int(color[i:i + 2], 16) / 255) for i in (0, 2, 4))
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return result


leather = material('Warm saddle leather', 'A6733F', .87)
leather_light = material('Honey leather facets', 'BC8950', .83)
leather_dark = material('Purse leather seams', '6B482B', .9)
leather_inside = material('Dark hollow purse lining', '38271E', .95)
green = material('Moss green drawstring collar', '405A38', .83)
green_light = material('Collar cut edge', '6D8449', .83)
thread = material('Warm flax drawstring', 'E0C28A', .86)
brass = material('Worn warm brass', 'C1903B', .32, .6)
gold = material('Warm gold minting', 'F5CD65', .28, .52)
gold_dark = material('Coin recessed field', '95672A', .42, .4)

scene = bpy.context.scene
scene.name = 'Mossvale merchant emblem'
scene.render.engine = 'CYCLES'
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.render.film_transparent = True
scene.render.filter_size = 1.0
scene.view_settings.view_transform = 'AgX'
scene.world = bpy.data.worlds.new('Merchant emblem soft studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.25, .29, .27, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
for position, energy, size, tint in [((-3, 4, 6), 720, 4, (1, .87, .68)), ((3, -1, 5), 220, 5, (.75, .87, 1))]:
    bpy.ops.object.light_add(type='AREA', location=position)
    lamp = bpy.context.object
    lamp.data.energy, lamp.data.size, lamp.data.color = energy, size, tint
    lamp.rotation_euler = (-lamp.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add(location=(0, 0, 10))
scene.camera = bpy.context.object
scene.camera.name = 'Transparent icon orthographic camera'
scene.camera.data.type = 'ORTHO'
scene.camera.data.ortho_scale = 2.5
root = bpy.data.objects.new('Merchant purse and leaf coins', None)
scene.collection.objects.link(root)


def group(name, parent, position=(0, 0, 0), angle=0):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    obj.parent, obj.location = parent, position
    obj.rotation_euler.z = angle
    return obj


def box(name, position, size, mat, parent, bevel=.015, angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name, obj.parent, obj.scale = name, parent, size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler.z = angle
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Crisp carved edge', 'BEVEL')
        mod.width, mod.segments = bevel, 1
        obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
    return obj


def disc(name, position, radius, depth, mat, parent, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=position)
    obj = bpy.context.object
    obj.name, obj.parent = name, parent
    obj.data.materials.append(mat)
    mod = obj.modifiers.new('Single minted bevel', 'BEVEL')
    mod.width, mod.segments = .012, 1
    obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
    return obj


def leaf(parent, position, length=.28, angle=0):
    width = length * .28
    vertices = [(0, -length / 2, 0), (-width, -.06 * length, 0), (-width * .7, length * .23, 0),
                (0, length / 2, 0), (width * .7, length * .23, 0), (width, -.06 * length, 0),
                (0, -length * .23, .025), (0, length * .23, .04)]
    faces = [(0, 1, 6), (1, 2, 7, 6), (2, 3, 7), (3, 4, 7), (4, 5, 6, 7), (5, 0, 6)]
    mesh = bpy.data.meshes.new('Raised leaf stamp facets')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(brass)
    mesh.materials.append(gold)
    for face in mesh.polygons:
        face.material_index = face.index % 2
    obj = bpy.data.objects.new('Mossvale leaf stamp', mesh)
    scene.collection.objects.link(obj)
    obj.parent, obj.location = parent, position
    obj.rotation_euler.z = angle
    return obj


def coin(parent, position, radius=.3, tilt=0, angle=0):
    assembly = group('Twelve-sided leaf coin', parent, position, angle)
    assembly.rotation_euler.x = tilt
    disc('Gold coin bevel rim', (0, 0, 0), radius, .092, brass, assembly)
    disc('Coin stamped recess', (0, 0, .048), radius * .84, .021, gold_dark, assembly)
    disc('Raised coin field', (0, 0, .064), radius * .7, .023, gold, assembly)
    leaf(assembly, (0, 0, .081), radius * 1.12, -.25)
    for i in range(8):
        turn = math.tau * i / 8
        box('Mint rim notch', (math.cos(turn) * radius * .9, math.sin(turn) * radius * .9, .055),
            (.025, .043, .015), gold, assembly, .004, turn)
    return assembly


purse = group('Editable leather purse', root, (-.2, .04, 0), -.08)
# Deliberate low-poly sewn panels and a genuinely open neck with an inset liner.
rings = [(-.83, .34, .2), (-.69, .51, .27), (-.4, .59, .31), (.05, .54, .29),
         (.35, .3, .19), (.47, .28, .175), (.72, .4, .18), (.81, .37, .16)]
vertices = []
for y, rx, rz in rings:
    for i in range(12):
        angle = i * math.tau / 12 + math.pi / 12
        vertices.append((math.cos(angle) * rx, y, math.sin(angle) * rz))
faces = [tuple(reversed(range(12)))]
for level in range(len(rings) - 1):
    for i in range(12):
        a = level * 12 + i
        b = level * 12 + (i + 1) % 12
        faces.append((a, b, b + 12, a + 12))
mesh = bpy.data.meshes.new('Faceted hollow sewn leather')
mesh.from_pydata(vertices, [], faces)
for mat in [leather, leather_light, leather_dark]:
    mesh.materials.append(mat)
for poly in mesh.polygons:
    poly.material_index = 1 if poly.index % 12 in [2, 3, 4] else (2 if poly.index % 12 in [6, 9] else 0)
obj = bpy.data.objects.new('Twelve hand-cut leather panels', mesh)
scene.collection.objects.link(obj)
obj.parent = purse
solid = obj.modifiers.new('Real leather thickness at opening', 'SOLIDIFY')
solid.thickness = .025
disc('Recessed dark purse mouth', (0, .755, 0), .31, .018, leather_inside, purse).rotation_euler.x = math.pi / 2

# Green collar and a readable central bow; broad details survive a 64 px render.
box('Moss leather drawstring band', (0, .455, .02), (.64, .13, .36), green, purse, .03)
box('Collar highlighted cut edge', (0, .415, .207), (.61, .025, .02), green_light, purse, .006)
box('Flax cord across collar', (0, .478, .218), (.61, .047, .041), thread, purse, .008)
box('Tied cord knot', (.08, .459, .261), (.135, .113, .079), thread, purse, .022, -.2)
box('Left hanging drawstring', (-.025, .273, .303), (.054, .37, .055), thread, purse, .01, -.29)
box('Right hanging drawstring', (.21, .278, .322), (.06, .35, .055), thread, purse, .01, .35)
box('Left cord brass end', (-.076, .108, .31), (.069, .093, .071), brass, purse, .012, -.29)
box('Right cord brass end', (.268, .119, .328), (.075, .095, .071), brass, purse, .012, .35)

# Stitches are sparsely spaced and geometric, without noisy microtexture.
for i in range(5):
    y = -.56 + i * .14
    box('Visible saddle stitch', (-.405, y, .243), (.051, .021, .03), thread, purse, .004, -.26)
box('Green leaf badge leather patch', (.025, -.345, .31), (.31, .37, .04), green, purse, .055, -.07)
leaf(purse, (.025, -.345, .34), .26, -.2)

# A coin peeks out of the open pouch; the front pair establishes the wallet cue.
coin(purse, (.085, .76, .045), .235, -.17, -.12)
coin(root, (.45, -.61, .41), .34, .14, -.11)
coin(root, (.77, -.76, .53), .285, -.1, .23)
# A short horizontal coin stack gives the emblem depth while retaining clear edges.
for i in range(3):
    stack = coin(root, (.27, -.86 + i * .055, .13 + i * .008), .265, 1.13, -.02)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
SOURCE.parent.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
scene.render.filepath = str(OUTPUT)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)
bpy.ops.render.render(write_still=True)

# Validate the actual rendered file, not only the requested render settings.
image = bpy.data.images.load(str(OUTPUT), check_existing=False)
assert tuple(image.size) == (256, 256), 'Emblem must be 256 x 256'
alpha = list(image.pixels)[3::4]
assert min(alpha) == 0 and max(alpha) > .99, 'Emblem must have transparent alpha and opaque geometry'
occupied = [i for i, value in enumerate(alpha) if value > .01]
xs, ys = [i % 256 for i in occupied], [i // 256 for i in occupied]
bounds = (min(xs), min(ys), max(xs), max(ys))
assert min(bounds[0], bounds[1], 255 - bounds[2], 255 - bounds[3]) >= 6, f'Insufficient transparent margin: {bounds}'
bpy.data.images.remove(image)
print(f'PASS: merchant emblem 256 x 256 RGBA; alpha bounds {bounds}; {OUTPUT.stat().st_size:,} bytes; editable source retained.')
