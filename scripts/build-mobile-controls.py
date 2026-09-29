"""Render Mossvale mobile control chrome from editable Blender geometry.

Rebuild: /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-mobile-controls.py
The 256px frames use an orthographic camera and real open centres.
"""
import math
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/ui/mobile'
SOURCE = ROOT / 'assets/source/mobile-controls.blend'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name, color, roughness=.6, metallic=0, opacity=1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes['Principled BSDF']
    rgb = [int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    rgb = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    if opacity < 1:
        transparent = mat.node_tree.nodes.new('ShaderNodeBsdfTransparent')
        blend = mat.node_tree.nodes.new('ShaderNodeMixShader')
        blend.inputs[0].default_value = opacity
        mat.node_tree.links.new(transparent.outputs[0], blend.inputs[1])
        mat.node_tree.links.new(shader.outputs[0], blend.inputs[2])
        mat.node_tree.links.new(blend.outputs[0], mat.node_tree.nodes['Material Output'].inputs['Surface'])
    return mat


oak = material('Smoked ironwood', '3D3528', .78)
shadow = material('Recessed timber edge', '172723', .85)
bronze = material('Woodland bronze', '927346', .4, .55)
highlight = material('Worn bronze bevel', 'C6AE79', .38, .45)
teal = material('Muted teal enamel', '628F82', .48, .2)
groove = material('Translucent joystick bronze', 'B4A17A', .6, .1, .25)
groove_shadow = material('Translucent joystick recess', '172F2B', .85, 0, .24)
groove_teal = material('Translucent direction inlay', '9BBCAF', .6, .1, .4)


def scene(name):
    current = bpy.data.scenes.new(name)
    bpy.context.window.scene = current
    current.render.engine = 'CYCLES'
    current.cycles.samples = 64
    current.cycles.use_denoising = True
    current.render.resolution_x = current.render.resolution_y = 256
    current.render.resolution_percentage = 100
    current.render.image_settings.file_format = 'PNG'
    current.render.image_settings.color_mode = 'RGBA'
    current.render.image_settings.color_depth = '8'
    current.render.image_settings.compression = 100
    current.render.film_transparent = True
    current.render.filter_size = 1
    current.view_settings.view_transform = 'AgX'
    current.world = bpy.data.worlds.new(name + ' studio')
    current.world.use_nodes = True
    current.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.22, .27, .24, 1)
    current.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
    for position, energy, size, tint in [((-3, 4, 6), 660, 4, (1, .90, .76)), ((3, -2, 5), 260, 5, (.72, .90, 1))]:
        bpy.ops.object.light_add(type='AREA', location=position)
        lamp = bpy.context.object
        lamp.data.energy, lamp.data.size, lamp.data.color = energy, size, tint
        lamp.rotation_euler = (-lamp.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(0, 0, 10))
    current.camera = bpy.context.object
    current.camera.name = name + ' orthographic camera'
    current.camera.data.type = 'ORTHO'
    current.camera.data.ortho_scale = 2.56
    return current


# Profile-based ring geometry follows the existing unit-frame asset builder.
def ring(name, profile, mat, count=128):
    vertices = [(math.cos(i * math.tau / count) * radius, math.sin(i * math.tau / count) * radius, z)
                for radius, z in profile for i in range(count)]
    faces = [(row * count + i, row * count + (i + 1) % count,
              (row + 1) % len(profile) * count + (i + 1) % count, (row + 1) % len(profile) * count + i)
             for row in range(len(profile)) for i in range(count)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def inlay(name, angle, radius, width, length, mat, z=.17):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(math.cos(angle) * radius, math.sin(angle) * radius, z))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (length, width, .018)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler.z = angle
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new('Soft carved edge', 'BEVEL')
    bevel.width, bevel.segments = .006, 2
    obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')


controls = scene('Mobile ability bezel')
ring('Dark structural rim', [(1.025, .01), (1.235, .01), (1.245, .04), (1.230, .09), (1.035, .09)], shadow)
ring('Bevelled timber grip', [(1.065, .05), (1.215, .05), (1.221, .10), (1.199, .145), (1.091, .145), (1.060, .10)], oak)
ring('Outer bronze binding', [(1.203, .11), (1.229, .07), (1.236, .09), (1.218, .145), (1.205, .155)], bronze)
ring('Outer catching bevel', [(1.207, .157), (1.216, .147), (1.221, .144), (1.214, .156)], highlight)
ring('Inner bronze aperture', [(1.033, .03), (1.033, .118), (1.045, .148), (1.062, .151), (1.082, .122), (1.072, .055)], bronze)
ring('Inner polished edge', [(1.034, .121), (1.043, .146), (1.052, .149), (1.043, .131)], highlight)
ring('Teal enamel hairline', [(1.087, .142), (1.087, .149), (1.096, .15), (1.097, .143)], teal)
for degrees in [45, 135, 225, 315]:
    angle = math.radians(degrees)
    inlay('Bronze joining pin', angle, 1.155, .048, .108, bronze)
    inlay('Small teal inset', angle, 1.155, .023, .043, teal, .184)
controls['pixel_contract'] = '256px RGBA; clear central circle diameter 200px; art radius 125px; no text or baked ability art.'

joystick = scene('Mobile joystick groove')
ring('Soft outer recessed groove', [(1.18, .01), (1.237, .01), (1.244, .035), (1.234, .065), (1.180, .065)], groove_shadow)
ring('Fine outer guide', [(1.221, .07), (1.226, .082), (1.233, .081), (1.235, .067)], groove)
ring('Inner travel groove', [(.815, .01), (.842, .01), (.847, .042), (.837, .06), (.814, .06)], groove_shadow)
ring('Inner guide highlight', [(.824, .064), (.831, .069), (.837, .064), (.831, .055)], groove)
for degrees in [0, 90, 180, 270]:
    angle = math.radians(degrees)
    inlay('Quiet direction mark', angle, 1.062, .025, .083, groove_teal, .08)
    inlay('Outer direction notch', angle, 1.175, .014, .052, groove, .08)
joystick['pixel_contract'] = '256px RGBA; open centre; translucent twin groove and four direction marks; art radius 125px.'

OUTPUT.mkdir(parents=True, exist_ok=True)
SOURCE.parent.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
for current, name in [(controls, 'control-ring'), (joystick, 'joystick-base')]:
    current.render.filepath = str(OUTPUT / f'{name}.png')
bpy.context.window.scene = controls
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)
for current in [controls, joystick]:
    bpy.context.window.scene = current
    bpy.ops.render.render(write_still=True)
    png = bpy.data.images.load(current.render.filepath, check_existing=False)
    assert tuple(png.size) == (256, 256)
    alpha = list(png.pixels)[3::4]
    assert all(alpha[y * 256 + x] == 0 for x in range(256) for y in range(256)
               if (x - 127.5) ** 2 + (y - 127.5) ** 2 < (100 if current == controls else 79) ** 2), 'Real transparent centre'
    occupied = [i for i, value in enumerate(alpha) if value > .02]
    bounds = (min(i % 256 for i in occupied), min(i // 256 for i in occupied), max(i % 256 for i in occupied), max(i // 256 for i in occupied))
    assert all(2 <= value <= 6 for value in [bounds[0], bounds[1], 255 - bounds[2], 255 - bounds[3]]), bounds
    assert max(alpha) > .99 if current == controls else .2 < max(alpha) < .85
    bpy.data.images.remove(png)
    print('MOBILE_CONTROLS_PASS', Path(current.render.filepath).name, '256x256', bounds, Path(current.render.filepath).stat().st_size, 'bytes')
