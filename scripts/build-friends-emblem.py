"""Render Mossvale's friends crest from editable Blender geometry.

Rebuild: /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-friends-emblem.py
"""
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/ui/friends-emblem.png'
SOURCE = ROOT / 'assets/source/friends-emblem.blend'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name, color, roughness=.65, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes['Principled BSDF']
    rgb = [int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    rgb = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return mat


oak = material('Dark carved oak', '493120', .8)
brass = material('Warm brass rim', 'B48A43', .32, .6)
gold = material('Golden companion', 'D6B467', .4, .3)
ivory = material('Ivory companion', 'F0DFB2', .58)
forest = material('Forest green leather', '304A32', .9)
moss = material('Moss green leaves', '6D8449', .8)
leaf_light = material('Leaf light facets', 'A5B868', .78)

scene = bpy.context.scene
scene.name = 'Mossvale friends emblem'
scene.render.engine = 'CYCLES'
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.render.film_transparent = True
scene.render.filter_size = 1.0
scene.view_settings.view_transform = 'AgX'
scene.world = bpy.data.worlds.new('Friends emblem soft studio')
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
scene.camera.name = 'Friends orthographic icon camera'
scene.camera.data.type = 'ORTHO'
scene.camera.data.ortho_scale = 2.5


def finish(obj, name, mat, bevel=.025):
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Carved bevel', 'BEVEL')
        mod.width, mod.segments = bevel, 1
        obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
    return obj


def disc(name, radius, depth, z, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=depth, location=(0, 0, z))
    return finish(bpy.context.object, name, mat)


def box(name, position, size, mat, bevel=.035):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel)


def silhouette(name, points, z, mat):
    count = len(points)
    vertices = [(x, y, height) for height in (z, z + .10) for x, y in points]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    return finish(obj, name, mat, .023)


disc('Oak medallion back', 1.02, .14, -.05, oak)
disc('Faceted brass edge', 1.00, .13, .035, brass)
disc('Inset moss leather', .91, .065, .12, forest)

# Broad stepped shoulders and separated heads remain readable at 48 pixels.
box('Golden adventurer head', (.29, .39, .235), (.34, .37, .15), gold)
silhouette('Golden adventurer shoulders', [(-.07, -.39), (.65, -.39), (.65, -.14),
           (.56, .055), (.43, .115), (.15, .115), (.01, .055), (-.07, -.14)], .185, gold)
box('Ivory adventurer head', (-.28, .24, .355), (.39, .41, .17), ivory)
silhouette('Ivory adventurer shoulders', [(-.72, -.52), (.16, -.52), (.16, -.23),
           (.05, -.03), (-.13, .045), (-.43, .045), (-.60, -.03), (-.72, -.23)], .295, ivory)


def leaf(position, length, angle):
    width = length * .28
    vertices = [(0, -length / 2, 0), (-width, 0, 0), (0, length / 2, 0),
                (width, 0, 0), (0, 0, .035)]
    mesh = bpy.data.meshes.new('Woodland leaf facets')
    mesh.from_pydata(vertices, [], [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)])
    mesh.materials.append(moss)
    mesh.materials.append(leaf_light)
    for face in mesh.polygons:
        face.material_index = int(face.index < 2)
    obj = bpy.data.objects.new('Woodland leaf', mesh)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler.z = angle


for x, y, angle, length in [(-.72, -.72, -.8, .37), (-.91, -.49, -.37, .34),
                            (.73, -.70, .8, .35), (.90, -.47, .37, .30)]:
    leaf((x, y, .22), length, angle)
for x in (-.58, .58):
    box('Brass fastening pin', (x, .67, .168), (.055, .055, .035), gold, .01)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
SOURCE.parent.mkdir(parents=True, exist_ok=True)
scene.render.filepath = str(OUTPUT)
scene['authoring'] = 'Original Blender geometry: brass, moss leather and two carved adventurers.'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)
bpy.ops.render.render(write_still=True)

png = bpy.data.images.load(str(OUTPUT), check_existing=False)
assert tuple(png.size) == (512, 512), 'Exact icon dimensions'
alpha = list(png.pixels)[3::4]
assert min(alpha) == 0 and max(alpha) > .99, 'Transparent background and opaque artwork'
occupied = [i for i, value in enumerate(alpha) if value > .01]
xs, ys = [i % 512 for i in occupied], [i // 512 for i in occupied]
bounds = (min(xs), min(ys), max(xs), max(ys))
assert min(bounds[0], bounds[1], 511 - bounds[2], 511 - bounds[3]) >= 12, bounds
bpy.data.images.remove(png)
print(f'FRIENDS_EMBLEM_PASS: 512x512 RGBA; alpha bounds {bounds}; {OUTPUT.stat().st_size:,} bytes; editable source retained.')
