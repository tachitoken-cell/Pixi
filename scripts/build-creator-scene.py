"""Rebuild Mossvale's original, texture-free character-selection woodland.

/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-creator-scene.py -- --render
Coordinates below use the runtime convention: Y up, +Z forward, character feet at (0, 0, 0).
"""
import bpy
import json
import math
import random
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/source/creator-scene.blend"
EXPORT = ROOT / "public/models/creator-scene.glb"
PREVIEW = ROOT / "assets/source/creator-scene-preview.png"
random.seed(82117)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for material in list(bpy.data.materials):
    bpy.data.materials.remove(material)

PALETTE = {
    "ground-deep": "274B38", "ground-moss": "496844", "grass": "6F8754",
    "fern": "86A566", "leaf-shadow": "1E4A3C", "leaf": "33714E",
    "leaf-sun": "528554", "leaf-mint": "779464", "bark": "654C38",
    "bark-light": "896747", "stone": "798875", "stone-light": "B0B59A",
    "stone-shadow": "536B60", "path": "B8AD8B", "path-shadow": "928B70",
    "lantern-frame": "4B4234", "old-gold": "BD9855", "lantern-core": "FFD984",
}
meshes = {key: {"vertices": [], "faces": []} for key in PALETTE}
box_count = 0


def coordinates(x, y, z):
    # glTF's Blender exporter reverses this rotation, restoring runtime Y-up coordinates.
    return (x, -z, y)


def srgb(channel):
    value = int(channel, 16) / 255
    return value / 12.92 if value < .04045 else ((value + .055) / 1.055) ** 2.4


def box(material, x, y, z, width, height, depth, turn=0):
    global box_count
    data = meshes[material]
    first = len(data["vertices"])
    c, s = math.cos(turn), math.sin(turn)
    for a, b, d in [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                    (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]:
        xx, yy, zz = a * width / 2, b * height / 2, d * depth / 2
        data["vertices"].append(coordinates(x + xx * c + zz * s, y + yy, z - xx * s + zz * c))
    # Consistent outward faces; every block remains deliberately flat shaded.
    for face in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]:
        data["faces"].append(tuple(first + i for i in face))
    box_count += 1


def grass(x, z, scale=1):
    for offset in [-.10, .10]:
        box("grass" if offset < 0 else "fern", x + offset * scale, .16 * scale, z, .09 * scale, .30 * scale, .09 * scale)
    box("grass", x, .07 * scale, z, .29 * scale, .12 * scale, .21 * scale)


def rock(x, z, scale=1):
    box("stone-shadow", x, .17 * scale, z, .90 * scale, .34 * scale, .73 * scale, .12)
    box("stone", x - .08 * scale, .38 * scale, z, .67 * scale, .30 * scale, .61 * scale, -.05)
    box("ground-moss", x - .14 * scale, .55 * scale, z + .05 * scale, .46 * scale, .09 * scale, .42 * scale)


def tree(x, z, scale, distant=False):
    trunk_height = 4.0 * scale
    box("bark", x, trunk_height / 2, z, .62 * scale, trunk_height, .60 * scale)
    box("bark-light", x - .16 * scale, 1.85 * scale, z + .316 * scale, .12 * scale, 2.5 * scale, .025 * scale)
    for side in [-1, 1]:
        box("bark", x + side * .39 * scale, .19 * scale, z, .61 * scale, .38 * scale, .45 * scale)
        box("bark", x + side * .62 * scale, 2.8 * scale, z, 1.45 * scale, .32 * scale, .34 * scale)
        box("bark", x + side * 1.18 * scale, 3.15 * scale, z, .32 * scale, .70 * scale, .31 * scale)
    box("bark", x, .20 * scale, z + .45 * scale, .50 * scale, .40 * scale, .75 * scale)
    # Four irregular tiers keep a broadleaf silhouette while retaining large, readable voxels.
    for dx, dy, dz, w, h, d in [(-.80, 3.85, -.12, 2.7, 1.12, 2.8), (.82, 4.30, .10, 2.6, 1.2, 2.9),
                               (-.25, 4.82, -.15, 3.0, 1.15, 2.55), (-.42, 5.50, -.15, 2.05, .62, 1.90)]:
        tint = "leaf-shadow" if distant else ("leaf" if dy < 4.5 else "leaf-sun")
        box(tint, x + dx * scale, dy * scale, z + dz * scale, w * scale, h * scale, d * scale)
    if not distant:
        for dx, dz in [(-1.05, .95), (.68, 1.30), (1.58, -.55), (-1.52, -.62)]:
            box("leaf-mint" if dx < 0 else "leaf", x + dx * scale, (4.25 + .18 * dx) * scale, z + dz * scale,
                .85 * scale, .52 * scale, .75 * scale)
        box("leaf-mint", x - .65 * scale, 5.84 * scale, z + .18 * scale, 1.15 * scale, .12 * scale, 1.15 * scale)


# Continuous 60m ground avoids a miniature-diorama edge in wide creator layouts.
box("ground-deep", 0, -.38, -12, 60, .64, 76)
for x, z, w, d in [(-12, -6, 19, 24), (12, -8, 20, 28), (-16, -28, 25, 19), (16, -28, 25, 22), (0, 11, 21, 14)]:
    box("ground-moss", x, -.08, z, w, .08, d)

# The central flagstones end exactly at Y=0: the supplied character stands on the model.
for row in range(-3, 4):
    for col in range(-3, 4):
        x, z = col * .70, row * .68
        tint = "path" if (row + col) % 4 else "path-shadow"
        box(tint, x + random.uniform(-.016, .016), -.09, z + random.uniform(-.014, .014), .65, .18, .63)
for side in [-1, 1]:
    for row in range(-3, 4):
        box("stone", side * 2.48, -.065, row * .7, .27, .13, .66)

# The worn road recedes beneath the gate and continues through the actual forest.
for row in range(37):
    z = -2.7 - row * .74
    bend = math.sin(row * .20) * max(0, row - 10) * .042
    for col in [-1, 0, 1]:
        if row > 14 and random.random() < .13:
            continue
        box("path" if random.random() > .24 else "path-shadow", col * .65 + bend, -.095, z,
            .59, .17, .67, random.uniform(-.035, .035))
for row in range(11):
    for col in [-1, 0, 1]:
        box("path-shadow" if row % 3 else "path", col * .71, -.09, 2.75 + row * .75, .66, .18, .67)

# Old stepped arch: individual blocks, recessed joints, a lantern crest, and creeping moss.
for side in [-1, 1]:
    x = side * 2.62
    box("stone-shadow", x, .14, -6.4, 1.45, .28, 1.55)
    box("stone", x, .37, -6.4, 1.27, .25, 1.40)
    for level in range(5):
        box("stone" if level % 2 else "stone-light", x + side * (level % 2) * .035, .79 + level * .55, -6.4,
            1.02, .515, 1.07)
        box("stone-shadow", x - side * .23, .77 + level * .55, -5.848, .06, .40, .026)
    box("stone-light", x, 3.57, -6.4, 1.42, .37, 1.33)
    box("stone", side * 2.16, 3.96, -6.4, 1.15, .43, 1.11)
    box("stone-light", side * 1.51, 4.31, -6.4, 1.28, .42, 1.05)
    box("stone", side * .78, 4.62, -6.4, 1.18, .38, 1.07)
    box("ground-moss", x + side * .22, 3.80, -6.35, .91, .13, 1.18)
    # Small broken pedestals beside the entrance establish age without blocking the stage.
    box("stone-shadow", side * 4.13, .24, -7.4, .98, .48, 1.0)
    box("stone", side * 4.13, .82, -7.4, .69, .72, .72)
    box("stone-light", side * 4.20, 1.27, -7.4, .91, .22, .83, side * .12)
box("stone-light", 0, 4.79, -6.4, .76, .71, 1.22)
box("stone-shadow", 0, 4.70, -5.767, .45, .43, .08)
box("old-gold", 0, 4.72, -5.71, .17, .32, .045)
box("old-gold", 0, 4.72, -5.70, .34, .09, .055)
box("lantern-core", 0, 4.72, -5.655, .085, .10, .038)
for x in [-2.95, -2.67, -2.38, 1.34, 1.59, 1.83]:
    top = 3.83 if x < 0 else 4.54
    length = random.randint(2, 5)
    for step in range(length):
        box("leaf" if step % 2 else "leaf-sun", x + math.sin(step) * .07, top - step * .22, -5.79, .18, .24, .10)

# Two warm lanterns. Emission is authored; runtime owns actual lighting and shadows.
for side in [-1, 1]:
    x, z = side * 3, -2.0
    box("stone-shadow", x, .11, z, .54, .22, .54)
    box("stone", x, .27, z, .39, .14, .39)
    box("lantern-frame", x, .87, z, .14, 1.12, .14)
    box("old-gold", x, 1.42, z, .49, .11, .49)
    box("lantern-core", x, 1.64, z, .26, .36, .26)
    for dx in [-.18, .18]:
        for dz in [-.18, .18]:
            box("lantern-frame", x + dx, 1.65, z + dz, .055, .45, .055)
    box("old-gold", x, 1.91, z, .52, .11, .52)
    box("lantern-frame", x, 2.01, z, .34, .11, .34)
    box("old-gold", x, 2.11, z, .11, .11, .11)
    grass(x - side * .40, z + .26, .85)

# Deliberately staggered side trees frame the open path instead of filling the avatar stage.
for x, z, scale in [(-5.8, -3.5, 1.26), (5.6, -4.5, 1.28), (-7.8, -8.0, 1.05), (8.0, -9.2, 1.13),
                    (-5.5, -12, 1.0), (5.1, -13.8, 1.12), (-10.8, -13, 1.35), (11.5, -15, 1.30),
                    (-8.5, -20, 1.35), (8.1, -22, 1.38), (-13, -4.0, 1.62), (13, -5, 1.54)]:
    tree(x, z, scale)
for row, z in enumerate([-29, -38, -47]):
    for col in range(-3, 4):
        tree(col * 6.5 + (row % 2) * 2.2, z + random.uniform(-2, 2), random.uniform(1.25, 1.8), distant=True)

for side in [-1, 1]:
    for x, z, scale in [(3.8, -3.8, .74), (4.2, -9.2, 1.25), (7.2, -2.0, 1.18), (3.5, -14, .83), (10, -17, 1.30)]:
        rock(x * side, z, scale)
    # Broad, low shrubs are easier to read behind the controls than thin foliage cards.
    for x, z in [(4.3, .1), (6.1, -6.1), (4.5, -10.7), (8.7, -13.5), (10, -1.8)]:
        box("leaf-shadow", side * x, .29, z, 1.44, .58, 1.1)
        box("leaf", side * x - .15, .62, z, 1.09, .44, .91)
        box("leaf-sun", side * x - .24, .87, z + .06, .69, .17, .71)
    for i in range(27):
        x, z = side * random.uniform(2.95, 12), random.uniform(-21, 3)
        grass(x, z, random.uniform(.65, 1.2))

# Material merging is the equivalent optimization path when glTF Transform is unavailable:
# a single mesh per reused material, no duplicate vertex attributes, textures or hidden objects.
for name, color in PALETTE.items():
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    rgba = tuple(srgb(color[i:i + 2]) for i in [0, 2, 4]) + (1,)
    material.diffuse_color = rgba
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba
    shader.inputs["Roughness"].default_value = .91 if name != "old-gold" else .60
    if name == "old-gold":
        shader.inputs["Metallic"].default_value = .30
    if name == "lantern-core":
        shader.inputs["Emission Color"].default_value = rgba
        shader.inputs["Emission Strength"].default_value = 2.6
    data = meshes[name]
    mesh = bpy.data.meshes.new(f"creator-{name}")
    mesh.from_pydata(data["vertices"], [], data["faces"])
    mesh.update()
    mesh.materials.append(material)
    obj = bpy.data.objects.new(f"creator-{name}", mesh)
    bpy.context.collection.objects.link(obj)

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1
scene["runtime_axes"] = "Y up, +Z forward. Avatar feet (0,0,0). glTF export_yup=True."
scene["clear_stage"] = "x[-1.5,1.5], z[-1,1.5], no decoration above ground."
scene["lighting"] = "Dynamic runtime lighting. Emissive lantern cores at (+/-3,1.64,-2)."
scene["authoring"] = "Original Mossvale voxel woodland. Reproducible seed 82117; no images or textures."

def aim(obj, point):
    obj.rotation_euler = (Vector(coordinates(*point)) - obj.location).to_track_quat("-Z", "Y").to_euler()


bpy.ops.object.camera_add(location=coordinates(1.7, 2.1, 6))
camera = bpy.context.object
camera.name = "Preview-Camera-NOT-EXPORTED"
camera.data.lens = 26.4  # 42-degree vertical FOV at the 16:9 runtime aspect ratio.
aim(camera, (0, 1.2, 0))
scene.camera = camera
for name, position, power, size in [("Preview-Key", (-6, 11, 4), 1550, 9), ("Preview-Sky", (6, 8, -5), 1000, 12)]:
    bpy.ops.object.light_add(type="AREA", location=coordinates(*position))
    light = bpy.context.object
    light.name = name
    light.data.energy, light.data.shape, light.data.size = power, "DISK", size
    aim(light, (0, 0, -3))
bpy.ops.object.light_add(type="SUN", location=coordinates(-5, 9, 4))
sun = bpy.context.object
sun.name = "Preview-Sun"
sun.data.energy, sun.data.angle = 1.6, .16
sun.data.color = (1.0, .90, .74)
aim(sun, (0, 0, -6))
for x in [-3, 3]:
    bpy.ops.object.light_add(type="POINT", location=coordinates(x, 1.65, -1.85))
    bpy.context.object.name = "Preview-Lantern"
    bpy.context.object.data.energy = 42
    bpy.context.object.data.color = (1.0, .58, .20)
    bpy.context.object.data.shadow_soft_size = .35
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.15, .24, .19, 1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .55
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1280, 720, 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(PREVIEW)
scene.view_settings.view_transform = "AgX"

for folder in [SOURCE.parent, EXPORT.parent]:
    folder.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)
bpy.ops.object.select_all(action="DESELECT")
for obj in scene.objects:
    if obj.type == "MESH":
        obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(EXPORT), export_format="GLB", use_selection=True,
                          export_yup=True, export_apply=True, export_animations=False,
                          export_cameras=False, export_lights=False, export_extras=False)
runtime_vertices = [(v[0], v[2], -v[1]) for data in meshes.values() for v in data["vertices"]]
stats = {
    "boxes": box_count, "meshes": len(PALETTE), "materials": len(PALETTE),
    "triangles": box_count * 12, "glb_bytes": EXPORT.stat().st_size,
    "source_bytes": SOURCE.stat().st_size,
    "bounds_three": {"min": [min(v[i] for v in runtime_vertices) for i in range(3)],
                     "max": [max(v[i] for v in runtime_vertices) for i in range(3)]},
    "origin": [0, 0, 0], "clear_stage": {"x": [-1.5, 1.5], "z": [-1, 1.5]},
}
print("CREATOR_SCENE " + json.dumps(stats))
if "--render" in sys.argv:
    bpy.ops.render.render(write_still=True)
