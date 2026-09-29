"""Rebuild original, lightweight Mossvale water VFX with Blender.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-water-assets.py -- --render
Three.js contract: Y up; wake trails along -Z; splash is grounded at Y=0;
droplet is one metre tall centred at the origin. The three meshes share one
neutral vertex-colour material. Thin open sheets need a DoubleSide runtime material.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/water-effects.blend'
EXPORT = ROOT / 'public/models/water-effects.glb'
PREVIEW = ROOT / 'assets/source/water-effects-preview.png'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for old in list(bpy.data.materials):
    bpy.data.materials.remove(old)


def xyz(x, y, z):
    return (x, -z, y)


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


library = bpy.context.scene
library.name = 'Water effects library'
library.unit_settings.system = 'METRIC'
library.unit_settings.scale_length = 1
material = bpy.data.materials.new('water-effects-neutral')
material.use_nodes = True
material.use_backface_culling = False
shader = material.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .28
shader.inputs['Base Color'].default_value = (1, 1, 1, 1)
colors = material.node_tree.nodes.new('ShaderNodeVertexColor')
colors.layer_name = 'FoamTint'
material.node_tree.links.new(colors.outputs['Color'], shader.inputs['Base Color'])
mesh_data = {}
objects = []


def mesh(name, vertices, faces):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(*p) for p in vertices], [], faces)
    data.update()
    data.materials.append(material)
    tint = data.color_attributes.new(name='FoamTint', type='FLOAT_COLOR', domain='CORNER')
    for face in data.polygons:
        for index in face.loop_indices:
            # Deliberately near-white so the runtime can tint the shared material freely.
            y = vertices[data.loops[index].vertex_index][1]
            shade = .88 + min(1, max(0, y + .1)) * .10
            tint.data[index].color = (linear(shade), linear(.97 + .02 * shade), linear(.98), 1)
    obj = bpy.data.objects.new(name, data)
    library.collection.objects.link(obj)
    obj['runtime_axes'] = 'Y up, +Z forward; identity transform'
    obj['thin_open_sheet'] = name != 'droplet'
    objects.append(obj)
    mesh_data[name] = {'vertices': vertices, 'faces': faces}
    return obj


# Twin narrow, curved foam ribbons: the centre of the V is completely open.
vertices, faces = [], []
segments = 12
for side in [-1, 1]:
    first = len(vertices)
    for i in range(segments + 1):
        t = i / segments
        x = side * (.35 + .86 * math.sin(t * math.pi * .55))
        z = -.03 - 1.91 * t
        y = .008 + .042 * math.sin(t * math.pi)
        dx = side * .86 * math.pi * .55 * math.cos(t * math.pi * .55)
        dz = -1.91
        length = math.hypot(dx, dz)
        width = .014 + .11 * math.sin(math.pi * t) ** .7
        for edge in [-1, 1]:
            vertices.append((x + edge * (-dz / length) * width / 2, y + (edge * side) * .004, z + edge * (dx / length) * width / 2))
    for i in range(segments):
        a = first + i * 2
        faces.append((a, a + 1, a + 3, a + 2))
# Three tiny, disconnected foam flecks, never a filled triangular wake surface.
for x, z, length, width in [(-.82, -1.77, .19, .035), (.88, -1.91, .14, .030), (.49, -1.26, .12, .025)]:
    start = len(vertices)
    vertices.extend([(x, .018, z - length / 2), (x + width / 2, .02, z), (x, .018, z + length / 2), (x - width / 2, .02, z)])
    faces.append((start, start + 1, start + 2, start + 3))
mesh('wake', vertices, faces)

# Six broad but paper-thin petals bend outward and curl sideways. Gaps stay open
# between the sheets and through the middle, so this reads as water rather than spikes.
vertices, faces = [], []
heights = [.46, .59, .67, .43, .61, .53]
radii = [.27, .39, .53, .62, .64, .60]
levels = [0, .16, .37, .63, .87, 1]
widths = [.45, .50, .54, .47, .29, .10]
for petal in range(6):
    first = len(vertices)
    angle = petal * math.tau / 6 + [0, .09, -.04, .04, -.08, .025][petal]
    for row, (radius, level, width) in enumerate(zip(radii, levels, widths)):
        drift = .20 * level * level * (-1 if petal % 2 else 1)
        for col in [-1, 0, 1]:
            a = angle + drift + col * width / 2
            # The centre of each ribbon bows out slightly; a few large facets remain readable.
            r = radius + (.017 if col == 0 and row not in [0, 5] else 0)
            y = .008 + level * heights[petal] - abs(col) * .012 * math.sin(level * math.pi)
            vertices.append((math.sin(a) * r, y, math.cos(a) * r))
    for row in range(len(levels) - 1):
        for col in range(2):
            a = first + row * 3 + col
            faces.append((a, a + 3, a + 4, a + 1))
# Broken low arcs unify the foot of the crown without capping its centre.
for arc in range(3):
    first = len(vertices)
    for i in range(4):
        angle = arc * math.tau / 3 + .62 + i * .095
        for radius in [.285, .325]:
            vertices.append((math.sin(angle) * radius, .012, math.cos(angle) * radius))
    for i in range(3):
        a = first + i * 2
        faces.append((a, a + 1, a + 3, a + 2))
mesh('splash', vertices, faces)

# A six-sided teardrop, centred at the origin and exactly one metre tall before scaling.
vertices = [(0, -.5, 0)]
faces = []
rings = [(-.31, .27), (.01, .285), (.23, .17)]
for y, radius in rings:
    for i in range(6):
        a = i * math.tau / 6
        vertices.append((math.cos(a) * radius, y, math.sin(a) * radius))
vertices.append((0, .5, 0))
for i in range(6):
    nxt = (i + 1) % 6
    faces.append((0, 1 + nxt, 1 + i))
    for row in range(2):
        a = 1 + row * 6
        faces.append((a + i, a + nxt, a + 6 + nxt, a + 6 + i))
    faces.append((13 + i, 13 + nxt, 19))
mesh('droplet', vertices, faces)

library['authoring'] = 'Original stylized low-poly foam ribbons and open splash sheets. No image generation, textures or external assets.'
library['runtime'] = 'Meshes wake/splash/droplet, one neutral material, metres, Y up. Wake trails -Z. Use a double-sided replacement material.'
for directory in [SOURCE.parent, EXPORT.parent]:
    directory.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT), export_format='GLB', use_selection=True,
                          export_yup=True, export_apply=True, export_animations=False,
                          export_cameras=False, export_lights=False, export_extras=False)

# Keep the source library unchanged and add a separately arranged, lit review scene.
gallery = bpy.data.scenes.new('Water effects preview')
bpy.context.window.scene = gallery
for original, position in zip(objects, [(-2.1, .025, .25), (0, .03, -.35), (1.9, .62, -.45)]):
    duplicate = original.copy()
    duplicate.data = original.data
    gallery.collection.objects.link(duplicate)
    duplicate.location = xyz(*position)
bpy.ops.mesh.primitive_plane_add(size=200, location=xyz(0, -.018, 0))
water = bpy.context.object
water.name = 'Preview water - not exported'
water_material = bpy.data.materials.new('preview-deep-water')
water_material.use_nodes = True
water_shader = water_material.node_tree.nodes.get('Principled BSDF')
water_shader.inputs['Base Color'].default_value = (linear(.07), linear(.28), linear(.37), 1)
water_shader.inputs['Roughness'].default_value = .36
water_shader.inputs['Metallic'].default_value = .06
water.data.materials.append(water_material)

def aim(obj, target):
    obj.rotation_euler = (Vector(xyz(*target)) - obj.location).to_track_quat('-Z', 'Y').to_euler()

bpy.ops.object.camera_add(location=xyz(4.9, 6.4, 8.1))
camera = bpy.context.object
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 6.6
aim(camera, (-.15, .15, -.6))
gallery.camera = camera
for at, energy, size in [((-3, 7, 3), 1200, 6), ((3, 5, -5), 900, 5)]:
    bpy.ops.object.light_add(type='AREA', location=xyz(*at))
    light = bpy.context.object
    light.data.energy, light.data.shape, light.data.size = energy, 'DISK', size
    aim(light, (0, 0, -.5))
gallery.world = bpy.data.worlds.new('Water review world')
gallery.world.use_nodes = True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.12, .21, .25, 1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
gallery.render.engine = 'CYCLES'
gallery.cycles.samples = 24
gallery.cycles.use_denoising = True
gallery.render.resolution_x = 1200
gallery.render.resolution_y = 720
gallery.render.resolution_percentage = 100
gallery.render.image_settings.file_format = 'PNG'
gallery.render.filepath = str(PREVIEW)
gallery.view_settings.view_transform = 'AgX'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)
report = {'glb_bytes': EXPORT.stat().st_size, 'source_bytes': SOURCE.stat().st_size, 'meshes': {}}
for name, data in mesh_data.items():
    vertices = data['vertices']
    report['meshes'][name] = {
        'triangles': sum(len(face) - 2 for face in data['faces']),
        'min': [min(v[i] for v in vertices) for i in range(3)],
        'max': [max(v[i] for v in vertices) for i in range(3)],
    }
print('WATER_EFFECTS ' + json.dumps(report))
if '--render' in sys.argv:
    bpy.ops.render.render(write_still=True)
