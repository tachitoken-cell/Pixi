"""Render Mossvale's weathered map inventory icon with Blender.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-treasure-map-icon.py
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene

def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .82
    return mat

paper = material('Warm parchment', (.67, .43, .19))
edge = material('Rolled ochre edges', (.40, .21, .075))
ink = material('Woodland green ink', (.025, .08, .045))
red = material('Treasure cross', (.37, .028, .022))

def box(name, at, scale, mat, angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler.z = angle
    obj.data.materials.append(mat)
    return obj

box('Parchment sheet', (0, 0, 0), (1.48, 1.80, .075), paper)
for y in (-.89, .89):
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=.105, depth=1.62, location=(0, y, .035), rotation=(0, math.pi/2, 0))
    bpy.context.object.name = 'Rolled map edge'
    bpy.context.object.data.materials.append(edge)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=.076, depth=1.65, location=(0, y, .061), rotation=(0, math.pi/2, 0))
    bpy.context.object.data.materials.append(paper)

# Broken trail, drawn as thick ink dashes for readability in a small bag slot.
for x, y, a in [(-.42,-.52,0),(-.26,-.43,.6),(-.19,-.22,1.4),(-.27,-.04,2.0),(-.16,.14,.6),(.06,.23,.15),(.25,.34,.6)]:
    box('Trail dash', (x,y,.047), (.12,.039,.012), ink, a)
for angle in (math.pi/4,-math.pi/4):
    box('X marks the treasure', (.39,.50,.060), (.40,.080,.024), red, angle)
box('Compass north south',(-.40,.50,.052),(.032,.33,.014),ink)
box('Compass east west',(-.40,.50,.052),(.23,.032,.014),ink)
for side in (-1,1):
    box('Compass arrow',(-.40+side*.04,.60,.055),(.035,.13,.016),ink,side*.65)

scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = 192
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.view_settings.view_transform = 'Standard'
scene.world.color = (.45,.45,.45)
bpy.ops.object.light_add(type='AREA', location=(-3,-1,6))
bpy.context.object.data.energy = 450
bpy.context.object.data.shape = 'DISK'
bpy.context.object.data.size = 4
bpy.ops.object.camera_add(location=(.7,-1.7,6))
camera = bpy.context.object
camera.rotation_euler = (Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 2.5
scene.camera = camera
scene.render.filepath = str(root/'public/ui/loot/treasure-map.png')
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/source/treasure-map.blend'))
bpy.ops.render.render(write_still=True)
