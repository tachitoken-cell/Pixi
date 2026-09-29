"""Rebuild the village landmark: blender --background --python scripts/build-assets.py."""
from pathlib import Path
import math
import bpy

ROOT = Path(__file__).resolve().parents[1]
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def material(name, hex_color):
    mat = bpy.data.materials.new(name)
    srgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    mat.diffuse_color = tuple(c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in srgb) + (1,)
    mat.use_nodes = True
    mat.use_backface_culling = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = mat.diffuse_color
    shader.inputs["Roughness"].default_value = 0.87
    return mat

M = {name: material(name, color) for name, color in {
    "Warm limestone": "b9b39a", "Ivory plaster": "e8d4aa", "Dark oak": "594738",
    "Terracotta": "c76742", "Sunlit terracotta": "df8050", "Clock enamel": "f3e5bf",
    "Brass": "d5a451", "Shadow": "363b33", "Moss": "709657",
}.items()}

def block(name, pos, scale, mat):
    # Author in game coordinates (X, height, Z); GLB's Y-up conversion preserves them.
    x, y, z = pos
    sx, sy, sz = scale
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -z, y))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (sx, sz, sy)
    obj.data.materials.append(M[mat])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj

for tier in range(3):
    block("Limestone plinth", (0, 0.12 + tier * 0.21, 0), (4.2 - tier * .28, .24, 4.2 - tier * .28), "Warm limestone")
block("Tower plaster", (0, 3.4, 0), (3.2, 5.65, 3.2), "Ivory plaster")
for x in [-1.55, 1.55]:
    for z in [-1.55, 1.55]:
        block("Corner oak beam", (x, 3.35, z), (.25, 5.65, .25), "Dark oak")
for y in [1.05, 3.9, 5.8]:
    block("Oak belt", (0, y, 0), (3.44, .23, 3.44), "Dark oak")
block("Entry darkness", (0, 1.6, 1.615), (1.12, 1.9, .05), "Shadow")
block("Entry top", (0, 2.64, 1.66), (.75, .25, .22), "Warm limestone")
for x in [-.68, .68]:
    block("Entry pillar", (x, 1.56, 1.67), (.24, 2.2, .24), "Warm limestone")
for front in [-1, 1]:
    block("Clock surround", (0, 4.8, front * 1.65), (1.82, 1.82, .15), "Dark oak")
    block("Clock enamel", (0, 4.8, front * 1.75), (1.55, 1.55, .12), "Clock enamel")
    for angle in range(0, 360, 30):
        a = math.radians(angle)
        block("Clock hour", (math.sin(a) * .6, 4.8 + math.cos(a) * .6, front * 1.83), (.1, .12, .05), "Brass")
    block("Clock hour hand", (.19, 4.8, front * 1.89), (.46, .11, .08), "Dark oak")
    block("Clock minute hand", (0, 5.03, front * 1.9), (.11, .55, .08), "Dark oak")
block("Belfry floor", (0, 6.38, 0), (3.8, .36, 3.8), "Dark oak")
for x in [-1.38, 1.38]:
    for z in [-1.38, 1.38]:
        block("Belfry column", (x, 7.1, z), (.3, 1.65, .3), "Dark oak")
block("Bell stem", (0, 7.4, 0), (.22, .9, .22), "Brass")
for i in range(3):
    block("Square village bell", (0, 7.12 - i * .24, 0), (.65 + i * .23, .27, .65 + i * .23), "Brass")
block("Bell clapper", (0, 6.51, 0), (.19, .3, .19), "Dark oak")
for step in range(7):
    width = 4.4 - step * .54
    block("Voxel roof course", (0, 7.94 + step * .31, 0), (width, .34, width), "Terracotta" if step % 2 else "Sunlit terracotta")
block("Roof finial", (0, 10.25, 0), (.15, 1.15, .15), "Brass")
block("Weather vane", (.36, 10.56, 0), (.9, .14, .09), "Brass")
block("Weather vane flag", (.6, 10.74, 0), (.39, .38, .1), "Brass")
for x, z, width in [(-1.35, 1.65, .65), (1.3, 1.58, .46), (-1.6, -.5, .46)]:
    block("Moss on plinth", (x, .66, z), (width, .08, .45), "Moss")

# Merge by material: nine meshes, no textures, no runtime decoder needed.
for mat in M.values():
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.data.materials[0] == mat]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    bpy.context.object.name = mat.name.replace(" ", "_")

assert len([obj for obj in bpy.context.scene.objects if obj.type == "MESH"]) == len(M)
(ROOT / "assets").mkdir(exist_ok=True)
(ROOT / "public/models").mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "assets/mossvale-bell-tower.blend"))
target = ROOT / "public/models/mossvale-bell-tower.glb"
bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB", export_yup=True, export_apply=True)
assert target.stat().st_size < 200_000, "Landmark exceeded its 200 kB budget"
assert target.read_bytes()[:4] == b"glTF"
print(f"Verified {target.name}: {target.stat().st_size} bytes; {len(M)} shared materials.")
