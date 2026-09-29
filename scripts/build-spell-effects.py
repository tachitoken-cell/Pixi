"""Author the original Mossvale spell mesh library and its Blender review scene.

blender --background --python scripts/build-spell-effects.py -- --render
Ten single-mesh parts, one neutral vertex-colour material; no textures or bones.
glTF contract: metres, Y up, +Z forward, identity transforms, origin at centre.
Arrow/flame/shard/leaf/feather point +Z; shield faces +Z; circles lie in XZ.
Rebuilding also checks the exported glTF contract and its geometry budget.
"""
import bpy
import json
import math
import struct
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/spell-effects.blend'
EXPORT = ROOT / 'public/models/spell-effects.glb'
PREVIEW = ROOT / 'assets/source/spell-effects-preview.png'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def xyz(v):
    return (v[0], -v[2], v[1])


library = bpy.context.scene
library.name = 'Spell effects library'
library.unit_settings.system = 'METRIC'
material = bpy.data.materials.new('spell-neutral')
material.use_nodes = True
material.use_backface_culling = False
shader = material.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .34
shader.inputs['Metallic'].default_value = .08
colors = material.node_tree.nodes.new('ShaderNodeVertexColor')
colors.layer_name = 'SpellTint'
material.node_tree.links.new(colors.outputs['Color'], shader.inputs['Base Color'])
objects, report = [], {}
vertices, faces, shades = [], [], []


def add(points, polygons, tint=1):
    first = len(vertices)
    vertices.extend(tuple(point) for point in points)
    faces.extend(tuple(first + i for i in face) for face in polygons)
    shades.extend([tint] * len(polygons))


def tube(points, radii, sides=6, tint=1):
    """Faceted tube; stable frames also handle straight vertical ornaments."""
    points = [Vector(p) for p in points]
    verts, polys = [], []
    for row, p in enumerate(points):
        tangent = (points[min(row + 1, len(points) - 1)] - points[max(row - 1, 0)]).normalized()
        normal = tangent.cross(Vector((0, 1, 0)))
        if normal.length < .01:
            normal = tangent.cross(Vector((1, 0, 0)))
        normal.normalize()
        other = tangent.cross(normal).normalized()
        for i in range(sides):
            angle = math.tau * i / sides
            verts.append(p + radii[row] * (normal * math.cos(angle) + other * math.sin(angle)))
    for row in range(len(points) - 1):
        for i in range(sides):
            a, b = row * sides + i, row * sides + (i + 1) % sides
            polys.append((a, b, b + sides, a + sides))
    polys.extend([tuple(range(sides - 1, -1, -1)), tuple((len(points) - 1) * sides + i for i in range(sides))])
    add(verts, polys, tint)


def crystal(start, end, radius, sides=6, tint=1):
    a, b = Vector(start), Vector(end)
    tube([a, a.lerp(b, .18), a.lerp(b, .68), b], [0, radius, radius * .73, 0], sides, tint)


def arc(radius, width, start=0, end=math.tau, y=0, segments=48, taper=False, tint=1):
    verts, polys = [], []
    for i in range(segments + 1):
        t = i / segments
        angle = start + (end - start) * t
        w = width * (max(.015, math.sin(math.pi * t)) ** .8 if taper else 1)
        for offset, height in [(-w / 2, 0), (0, w * .32), (w / 2, 0)]:
            verts.append((math.cos(angle) * (radius + offset), y + height, math.sin(angle) * (radius + offset)))
    for i in range(segments):
        a = i * 3
        polys.extend([(a, a + 3, a + 4, a + 1), (a + 1, a + 4, a + 5, a + 2)])
    add(verts, polys, tint)


def finish(name):
    global vertices, faces, shades
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(p) for p in vertices], [], faces)
    data.update()
    data.materials.append(material)
    color = data.color_attributes.new(name='SpellTint', type='FLOAT_COLOR', domain='CORNER')
    for face, shade in zip(data.polygons, shades):
        for index in face.loop_indices:
            color.data[index].color = (shade, shade, shade, 1)
    obj = bpy.data.objects.new(name, data)
    library.collection.objects.link(obj)
    obj['runtime_axes'] = 'Y up, +Z forward, origin at centre, identity transform'
    objects.append(obj)
    report[name] = {'vertices': len(vertices), 'triangles': sum(len(f) - 2 for f in faces),
                    'min': [round(min(p[i] for p in vertices), 4) for i in range(3)],
                    'max': [round(max(p[i] for p in vertices), 4) for i in range(3)]}
    vertices, faces, shades = [], [], []


# Twisting flame: a ridged core and three tapered, separately readable tongues.
tube([(0, 0, -.48), (-.025, 0, -.32), (.01, .035, -.09), (-.04, .04, .14), (.04, .02, .34), (.005, 0, .5)],
     [0, .15, .16, .105, .042, 0], 8)
for side, lift, length in [(-1, .045, .34), (1, -.025, .28), (.4, .14, .39)]:
    tube([(0, 0, -.38), (side * .16, lift, -.2), (side * .19, lift * 1.2, .03),
          (side * .10, lift * 1.1, length)], [0, .075, .055, 0], 5, .68)
for side in [-1, 1]:
    tube([(side * .105, -.12, -.28), (side * .09, -.14, -.04), (side * .04, -.09, .18)],
         [.008, .018, 0], 4, 1)
finish('spell_flame')

# Frozen lance: long central crystal, asymmetric split tips and etched axial ribs.
crystal((0, 0, -.5), (0, 0, .5), .13, 6)
for a, z, length in [(.3, -.24, .48), (2.2, -.29, .42), (4.35, -.19, .5)]:
    x, y = math.cos(a), math.sin(a)
    crystal((x * .06, y * .06, z), (x * .22, y * .22, z + length), .058, 5, .62)
for a in [0, math.tau / 3, math.tau * 2 / 3]:
    tube([(math.cos(a) * .115, math.sin(a) * .115, -.24),
          (math.cos(a) * .084, math.sin(a) * .084, .18)], [.012, .005], 3, .82)
finish('spell_shard')

# Needle star with a bright central diamond and eight uneven, faceted rays.
crystal((0, 0, -.16), (0, 0, .16), .10, 8)
for i in range(8):
    a = math.tau * i / 8
    length = .49 if i % 2 == 0 else .28
    crystal((math.cos(a) * .045, 0, math.sin(a) * .045),
            (math.cos(a) * length, 0, math.sin(a) * length), .042 if i % 2 == 0 else .025, 4, .8)
crystal((0, -.28, 0), (0, .28, 0), .065, 4, .72)
finish('spell_spark')

# Three open concentric bands, broken timing marks and twelve original angular sigils.
arc(.96, .035, segments=64, tint=.72)
arc(.82, .022, segments=64)
arc(.45, .025, segments=48, tint=.8)
for i in range(12):
    a = math.tau * i / 12
    c, s = math.cos(a), math.sin(a)
    def glyph(point):
        x, z = point
        return (c * z - s * x, .018, s * z + c * x)
    # Alternating broken diamonds and forked runes keep the circle legible at game scale.
    paths = [[(-.045, .62), (0, .73), (.045, .62), (0, .56)],
             [[-.055, .69], [0, .62], [.055, .69]], [[0, .56], [0, .74]]]
    for path in paths[:1] if i % 2 == 0 else paths[1:]:
        tube([glyph(p) for p in path], [.010] * len(path), 4)
    tube([(c * .87, .006, s * .87), (c * .915, .006, s * .915)], [.009, .009], 4, .7)
for i in range(4):
    a = math.tau * i / 4
    arc(.60, .016, a + .18, a + 1.12, .009, 12, True)
finish('spell_rune')

# Serrated woodland leaf: articulated blade panels, raised spine and branching veins.
leaf_rows = [(-.5, 0), (-.38, .085), (-.25, .16), (-.1, .19), (.05, .175), (.2, .14), (.35, .075), (.5, 0)]
for i in range(len(leaf_rows) - 1):
    z0, w0 = leaf_rows[i]
    z1, w1 = leaf_rows[i + 1]
    for side in [-1, 1]:
        mid = (z0 + z1) / 2
        points = [(0, .04 * math.sin((z0 + .5) * math.pi), z0),
                  (side * w0, 0, z0), (side * (w0 + w1) * .55, -.008, mid - .012),
                  (side * w1, 0, z1), (0, .04 * math.sin((z1 + .5) * math.pi), z1)]
        add(points, [(0, 1, 2), (0, 2, 4), (2, 3, 4)], .62 + .06 * (i % 3))
        if i not in [0, 6]:
            tube([(0, .042, z0 + .02), (side * w1 * .8, .008, z1 - .01)], [.009, .003], 4, .96)
tube([(0, 0, -.5), (0, .044, -.08), (0, .028, .28), (0, 0, .5)], [.006, .009, .006, 0], 5)
finish('spell_leaf')

# Split feather vanes: overlapping individual barbs and an asymmetric curved quill.
for side in [-1, 1]:
    for i in range(12):
        t = i / 12
        z = -.39 + t * .73
        width = math.sin((t * .85 + .06) * math.pi) * (.13 if side == -1 else .19)
        x = .055 * math.sin((z + .5) * math.pi)
        add([(x, .012, z), (x + side * width, 0, z + .10),
             (x + side * width * .93, -.007, z + .139), (x + .005, .018, z + .075)],
            [(0, 1, 2), (0, 2, 3)], .60 + .025 * i)
tube([(0, 0, -.5), (.03, .016, -.28), (.055, .028, .04), (.04, .018, .31), (0, 0, .5)],
     [.009, .012, .011, .008, 0], 6)
finish('spell_feather')

# Pointed ward crest: raised bevel, convex face and embossed seven-ray sun insignia.
outline = [(0, -.5), (-.26, -.25), (-.34, .14), (-.28, .36), (0, .47), (.28, .36), (.34, .14), (.26, -.25)]
outer = [(x, y, .0) for x, y in outline]
inner = [(x * .83, y * .84, .052) for x, y in outline]
add(outer + inner + [(0, .035, .105)],
    [(i, (i + 1) % 8, (i + 1) % 8 + 8, i + 8) for i in range(8)] +
    [(i + 8, (i + 1) % 8 + 8, 16) for i in range(8)], .56)
tube(outer + [outer[0]], [.015] * 9, 5)
tube(inner + [inner[0]], [.007] * 9, 4, .8)
crystal((0, -.09, .111), (0, .21, .111), .055, 4)
for i in range(7):
    a = math.tau * i / 7
    tube([(math.cos(a) * .092, .065 + math.sin(a) * .092, .101),
          (math.cos(a) * .155, .065 + math.sin(a) * .155, .084)], [.012, .004], 4)
finish('spell_shield')

# Swept crescent with a bevel ridge and two slimmer, staggered trailing cuts.
arc(.70, .16, -.08, math.pi * 1.1, 0, 40, True)
arc(.88, .045, .13, math.pi * .90, -.018, 32, True, .6)
arc(.51, .024, .36, math.pi * 1.02, .018, 28, True, .82)
finish('spell_slash')

# Broken impact halo: fine inner rim, four flared outer arcs, eight diamond ticks.
arc(.74, .023, segments=64, tint=.82)
for i in range(4):
    a = math.tau * i / 4
    arc(.91, .072, a + .10, a + 1.34, 0, 20, True)
for i in range(8):
    a = math.tau * i / 8
    c, s = math.cos(a), math.sin(a)
    crystal((c * .79, 0, s * .79), (c, 0, s), .023, 4, .7)
finish('spell_ring')

# Barbed arrowhead, angular socket, narrow shaft, three notched feather flights.
tube([(0, 0, -.5), (0, 0, .23), (0, 0, .28)], [.013, .013, .025], 8, .72)
add([(0, 0, .5), (-.115, 0, .23), (-.040, 0, .255), (0, .031, .285),
     (.040, 0, .255), (.115, 0, .23), (0, -.031, .285)],
    [(0, 1, 3), (1, 2, 3), (0, 3, 5), (3, 4, 5), (0, 6, 1), (6, 2, 1), (0, 5, 6), (5, 4, 6)])
for i in range(3):
    a = math.tau * i / 3
    c, s = math.cos(a), math.sin(a)
    for j in range(5):
        z = -.45 + j * .038
        width = .072 * (1 - j * .11)
        add([(c * .012, s * .012, z), (c * width, s * width, z - .02),
             (c * width * .94, s * width * .94, z + .012), (c * .012, s * .012, z + .045)],
            [(0, 1, 2, 3)], .65 + j * .05)
finish('spell_arrow')

library['runtime'] = 'Ten neutral instancing meshes. Y-up / +Z-forward. Use double-sided materials for thin ornamental sheets.'
for directory in [SOURCE.parent, EXPORT.parent]:
    directory.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT), export_format='GLB', use_selection=True,
                          export_yup=True, export_apply=True, export_animations=False,
                          export_cameras=False, export_lights=False, export_extras=False)

# Review-only duplicates; exported meshes remain at the origin with a shared material.
gallery = bpy.data.scenes.new('Spell effects preview')
bpy.context.window.scene = gallery
palette = [(1, .22, .025), (.16, .7, 1), (.65, .36, 1), (.54, .26, 1), (.27, .78, .11),
           (1, .87, .52), (.95, .64, .12), (.5, .85, 1), (.2, .86, .82), (.75, .9, .5)]
label_material = bpy.data.materials.new('preview-label')
label_material.use_nodes = True
label_shader = label_material.node_tree.nodes.get('Principled BSDF')
label_shader.inputs['Base Color'].default_value = (.5, .66, .75, 1)
label_shader.inputs['Emission Color'].default_value = (.3, .5, .6, 1)
label_shader.inputs['Emission Strength'].default_value = .3
for i, original in enumerate(objects):
    duplicate = original.copy()
    duplicate.data = original.data.copy()
    gallery.collection.objects.link(duplicate)
    duplicate.location = xyz(((i % 5 - 2) * 2.5, .3, (i // 5 - .5) * 2.8))
    if i in [0, 1, 2, 4, 5, 9]:
        duplicate.scale = (1.5,) * 3
    if i == 6:
        duplicate.rotation_euler.x = math.radians(-48)
        duplicate.scale = (1.65,) * 3
    tint = material.copy()
    tint.name = f'preview-{original.name}'
    bsdf = tint.node_tree.nodes.get('Principled BSDF')
    vertex_color = bsdf.inputs['Base Color'].links[0].from_socket
    tint.node_tree.links.remove(bsdf.inputs['Base Color'].links[0])
    multiply = tint.node_tree.nodes.new('ShaderNodeMixRGB')
    multiply.blend_type = 'MULTIPLY'
    multiply.inputs[0].default_value = 1
    multiply.inputs[2].default_value = (*palette[i], 1)
    tint.node_tree.links.new(vertex_color, multiply.inputs[1])
    tint.node_tree.links.new(multiply.outputs[0], bsdf.inputs['Base Color'])
    bsdf.inputs['Emission Color'].default_value = (*palette[i], 1)
    bsdf.inputs['Emission Strength'].default_value = .35
    duplicate.data.materials.clear()
    duplicate.data.materials.append(tint)
    text = bpy.data.curves.new(f'label-{i}', 'FONT')
    text.body = original.name.replace('spell_', '').upper()
    text.align_x = 'CENTER'
    text.size = .15
    text.materials.append(label_material)
    label = bpy.data.objects.new(text.name, text)
    gallery.collection.objects.link(label)
    label.location = xyz(((i % 5 - 2) * 2.5, .018, (i // 5 - .5) * 2.8 + 1.13))

bpy.ops.mesh.primitive_plane_add(size=200, location=xyz((0, -.05, 0)))
floor = bpy.context.object
floor.name = 'Preview stage - not exported'
floor_material = bpy.data.materials.new('preview-midnight')
floor_material.use_nodes = True
floor_shader = floor_material.node_tree.nodes.get('Principled BSDF')
floor_shader.inputs['Base Color'].default_value = (.009, .019, .025, 1)
floor_shader.inputs['Roughness'].default_value = .75
floor.data.materials.append(floor_material)


def aim(obj, target):
    obj.rotation_euler = (Vector(xyz(target)) - obj.location).to_track_quat('-Z', 'Y').to_euler()


bpy.ops.object.camera_add(location=xyz((0, 12, 8)))
camera = bpy.context.object
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 13
aim(camera, (0, 0, .35))
gallery.camera = camera
for at, power, size in [((-5, 8, 2), 1700, 7), ((5, 4, -4), 1200, 6)]:
    bpy.ops.object.light_add(type='AREA', location=xyz(at))
    light = bpy.context.object
    light.data.energy, light.data.shape, light.data.size = power, 'DISK', size
    aim(light, (0, 0, 0))
gallery.world = bpy.data.worlds.new('Spell review world')
gallery.world.use_nodes = True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.12, .17, .24, 1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .4
gallery.render.engine = 'CYCLES'
gallery.cycles.samples = 24
gallery.cycles.use_denoising = True
gallery.render.resolution_x, gallery.render.resolution_y = 1800, 1050
gallery.render.resolution_percentage = 100
gallery.render.image_settings.file_format = 'PNG'
gallery.render.filepath = str(PREVIEW)
gallery.view_settings.view_transform = 'AgX'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)

# Validate the actual export, including attributes duplicated by faceted normals.
raw = EXPORT.read_bytes()
length, kind = struct.unpack_from('<II', raw, 12)
assert kind == 0x4e4f534a
gltf = json.loads(raw[20:20 + length])
assert len(gltf['meshes']) == len(objects) == 10
assert len(gltf['materials']) == 1
exported_vertices = 0
for node in gltf['nodes']:
    assert 'matrix' not in node and 'rotation' not in node and 'scale' not in node and 'translation' not in node, node
    mesh = gltf['meshes'][node['mesh']]
    assert len(mesh['primitives']) == 1
    primitive = mesh['primitives'][0]
    assert 'COLOR_0' in primitive['attributes']
    position = gltf['accessors'][primitive['attributes']['POSITION']]
    exported_vertices += position['count']
    for actual, expected in zip(position['min'] + position['max'], report[node['name']]['min'] + report[node['name']]['max']):
        assert abs(actual - expected) < .0001, (node['name'], actual, expected)
assert exported_vertices < 100_000
assert len(raw) < 400_000
print(json.dumps({'glb_bytes': len(raw), 'exported_vertices': exported_vertices, 'meshes': report}, indent=2))
if '--render' in sys.argv:
    bpy.ops.render.render(write_still=True)
