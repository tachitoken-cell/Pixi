"""Render Mossvale's editable X artwork with Blender; add -- --preview for drafts."""
import bpy
import math
import random
import struct
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/social"
OUT.mkdir(parents=True, exist_ok=True)
PREVIEW = "--preview" in sys.argv
random.seed(913)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0


def color(value):
    rgb = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb) + (1,)


def material(name, value, metal=0, glow=0, grain=False):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color(value)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    shader = nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = mat.diffuse_color
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = .42 if metal else .68
    if glow:
        shader.inputs["Emission Color"].default_value = mat.diffuse_color
        shader.inputs["Emission Strength"].default_value = glow
    if grain:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 48
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = .16
        bump.inputs["Distance"].default_value = .026
        mat.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        mat.node_tree.links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return mat


M = {
    "oak": material("Carved dark oak", "543E27", grain=True),
    "gold": material("Warm golden bevel", "D9A94F", .62),
    "ivory": material("Warm limestone face", "F5E5B9", grain=True),
    "moss": material("Deep emerald moss", "386F38"),
    "leaf": material("Sunlit moss", "75A83D"),
    "tip": material("Fresh fern tips", "AFCC62"),
    "sun": material("Amber sun crystal", "FFB52C", .25, .45),
    "core": material("Sun crystal facets", "FFE392", .15, 1.0),
}

# Original chamfered block alphabet, with real inset counters in O and A.
GLYPHS = {
    "M": [[(0, 0), (.30, 0), (.30, .59), (.49, .32), (.57, .32), (.76, .59), (.76, 0), (1.06, 0), (1.06, 1), (.81, 1), (.53, .60), (.25, 1), (0, 1)]],
    "O": [[(.13, 0), (.67, 0), (.80, .13), (.80, .87), (.67, 1), (.13, 1), (0, .87), (0, .13)], [(.28, .25), (.28, .75), (.52, .75), (.52, .25)]],
    "S": [[(.12, 0), (.67, 0), (.8, .13), (.8, .43), (.68, .55), (.26, .71), (.26, .77), (.55, .77), (.55, .66), (.80, .66), (.80, .87), (.67, 1), (.13, 1), (0, .87), (0, .60), (.12, .48), (.54, .31), (.54, .23), (.25, .23), (.25, .34), (0, .34), (0, .13)]],
    "V": [[(.30, 0), (.58, 0), (.90, 1), (.61, 1), (.44, .37), (.27, 1), (-.02, 1)]],
    "A": [[(0, 0), (.27, 0), (.33, .24), (.60, .24), (.66, 0), (.94, 0), (.66, 1), (.28, 1)], [(.38, .45), (.55, .45), (.465, .77)]],
    "L": [[(0, 0), (.72, 0), (.72, .26), (.29, .26), (.29, 1), (0, 1)]],
    "E": [[(0, 0), (.73, 0), (.73, .24), (.28, .24), (.28, .39), (.65, .39), (.65, .62), (.28, .62), (.28, .76), (.73, .76), (.73, 1), (0, 1)]],
}


def cube(name, position, scale, mat, parent=None, bevel=.02, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = position
    obj.rotation_euler = rotation
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Small crafted edges", "BEVEL")
        mod.width, mod.segments = bevel, 2
        obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
    return obj


def empty(name, scene):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    return obj


def letter(char, x, parent):
    for label, z, depth, edge, mat in [
        ("oak", -.115, .13, .057, M["oak"]),
        ("gold", .033, .037, .037, M["gold"]),
        ("ivory", .083, .028, .012, M["ivory"]),
    ]:
        curve = bpy.data.curves.new(f"{char} {label}", "CURVE")
        curve.dimensions, curve.fill_mode = "2D", "BOTH"
        curve.resolution_u = 1
        curve.extrude, curve.bevel_depth, curve.bevel_resolution = depth, edge, 2
        for polygon in GLYPHS[char]:
            spline = curve.splines.new("POLY")
            spline.points.add(len(polygon) - 1)
            for point, (px, py) in zip(spline.points, polygon):
                point.co = (px, py, 0, 1)
            spline.use_cyclic_u = True
        obj = bpy.data.objects.new(f"{char} / {label}", curve)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        obj.location = (x, 0, z)
        curve.materials.append(mat)


def moss(x, y, parent, scale=1):
    for dx, dy, size in [(-.10, .015, .13), (0, .045, .15), (.115, .025, .10), (-.07, -.08, .09), (.015, -.085, .10), (.015, -.17, .065)]:
        cube("Moss voxel", (x + dx * scale, y + dy * scale, .15),
             (size * scale, size * scale, .10 * scale), random.choice([M["moss"], M["leaf"], M["tip"]]), parent, .009 * scale)


def fern(parent, x, y, scale, side):
    for i in range(6):
        cx, cy = x + side * i * .095 * scale, y + i * .15 * scale
        cube("Fern stem", (cx, cy, -.03), (.045 * scale, .19 * scale, .07 * scale), M["moss"], parent, .005,
             (0, 0, -side * .45))
        for flip in [-1, 1]:
            length = (.23 - i * .02) * scale
            cube("Angular fern frond", (cx + flip * length * .45, cy + .03 * scale, .015),
                 (length, .09 * scale, .065 * scale), M["leaf"] if i < 4 else M["tip"], parent, .012 * scale,
                 (0, 0, flip * .48))


def crystal(parent, x, y, size):
    cube("Sun crystal", (x, y, .22), (size, size, size), M["sun"], parent, .025 * size,
         (.27, -.31, .30))
    for dx, dy, factor in [(-.76, .04, .28), (.56, .64, .30), (-.23, .86, .23)]:
        cube("Orbiting sun shard", (x + dx * size, y + dy * size, .19),
             (size * factor,) * 3, M["core"], parent, .009, (.15, -.25, .20))


def wordmark(scene, text):
    root = empty("Mossvale / sculpted lettering", scene)
    widths = [max(p[0] for p in GLYPHS[ch][0]) for ch in text]
    width = sum(widths) + .105 * (len(text) - 1)
    x = -width / 2
    for i, (ch, w) in enumerate(zip(text, widths)):
        letter(ch, x, root)
        if i in (0, 2, 4, 7):
            moss(x + w * .32, 1, root, .86)
        if i in (0, 3, 6):
            moss(x + w * .76, .10, root, .55)
        x += w + .105
    return root, width


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, position, target, power, size, tint=(1, 1, 1)):
    bpy.ops.object.light_add(type="AREA", location=position)
    light = bpy.context.object
    light.name = name
    light.data.energy, light.data.shape, light.data.size, light.data.color = power, "DISK", size, tint
    aim(light, target)
    return light


def setup(scene, width, height):
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24 if PREVIEW else 96
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 60 if PREVIEW else 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    if scene.world is None:
        scene.world = bpy.data.worlds.new(scene.name + " atmosphere")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.20, .28, .20, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .4
    # Blender 5 compositor uses a dedicated node group.
    tree = bpy.data.node_groups.new(scene.name + " gentle crystal bloom", "CompositorNodeTree")
    tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    scene.compositing_node_group = tree
    layers = tree.nodes.new("CompositorNodeRLayers")
    layers.scene = scene
    glare = tree.nodes.new("CompositorNodeGlare")
    glare.inputs["Type"].default_value = "Fog Glow"
    glare.inputs["Quality"].default_value = "High"
    glare.inputs["Threshold"].default_value = 2.0
    glare.inputs["Strength"].default_value = .20
    output = tree.nodes.new("NodeGroupOutput")
    tree.links.new(layers.outputs["Image"], glare.inputs["Image"])
    tree.links.new(glare.outputs["Image"], output.inputs["Image"])


avatar = bpy.context.scene
avatar.name = "01 / X profile - 1024 square"
setup(avatar, 1024, 1024)
root, width = wordmark(avatar, "M")
root.scale = (3, 3, 3)
root.location = (0, -1.63, 0)
root.rotation_euler = (0, -.08, -.025)
crystal(root, -.38, 1.24, .26)
fern(root, -.59, .12, .66, -1)
fern(root, .54, .07, .55, 1)
background = material("Deep forest backdrop", "123A2B")
cube("Forest backdrop", (0, 0, -1.40), (200, 200, .15), background, bevel=0)
bpy.ops.object.camera_add(location=(0, .20, 18))
avatar.camera = bpy.context.object
avatar.camera.name = "Profile camera - circular crop safe"
avatar.camera.data.type, avatar.camera.data.ortho_scale = "ORTHO", 6.35
avatar.camera.rotation_euler = (0, 0, 0)
area("Warm broad key", (-3, 4, 7), (0, 0, 0), 650, 4.5, (1, .85, .59))
area("Soft mint fill", (4, 1, 4), (0, 0, 0), 450, 4, (.60, .84, .73))
area("Gold rim", (-1, 5, 1.4), (0, 0, 0), 450, 3, (1, .75, .34))
avatar["purpose"] = "X profile icon, 1024 x 1024. Original editable M, voxel moss and sun crystal."

banner = bpy.data.scenes.new("02 / X banner - 1500 x 500")
bpy.context.window.scene = banner
setup(banner, 1500, 500)
with bpy.data.libraries.load(str(ROOT / "assets/source/creator-scene.blend"), link=False) as (source, target):
    target.objects = [name for name in source.objects if name.startswith("creator-")]
for obj in target.objects:
    banner.collection.objects.link(obj)
    if obj.type == "MESH":
        bevel = obj.modifiers.new("Light on voxel edges", "BEVEL")
        bevel.width, bevel.segments = .018, 1
        obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
bpy.ops.object.camera_add(location=(0, -10, 3.2))
banner.camera = bpy.context.object
banner.camera.name = "Banner camera"
banner.camera.data.lens = 32
aim(banner.camera, (0, 7, 2.8))
area("Forest sunbreak", (-7, -2, 12), (0, 6, 0), 2300, 8, (1, .80, .49))
area("Cool woodland sky", (5, 5, 10), (0, 5, 2), 1350, 10, (.58, .78, .77))
bpy.ops.object.light_add(type="SUN", location=(-10, -10, 15))
sun = bpy.context.object
sun.name = "Late afternoon through the canopy"
sun.data.energy, sun.data.angle, sun.data.color = 1.5, .12, (1, .83, .58)
aim(sun, (0, 4, 0))
for x in [-3, 3]:
    bpy.ops.object.light_add(type="POINT", location=(x, 1.9, 1.68))
    light = bpy.context.object
    light.data.energy, light.data.color, light.data.shadow_soft_size = 65, (1, .52, .13), .22

# Reuse the supplied design already shipped by the game; pack its alpha PNG in the .blend.
bpy.ops.mesh.primitive_plane_add(size=2)
title = bpy.context.object
title.name = "MOSSVALE / reference wordmark"
title.parent = banner.camera
title.location = (.15, -.02, -7)
title.scale = (3.10, 3.10 / 3, 1)
title.visible_shadow = False
ink = bpy.data.materials.new("Reference artwork / original PNG alpha")
ink.use_nodes = True
nodes, links = ink.node_tree.nodes, ink.node_tree.links
nodes.clear()
texture = nodes.new("ShaderNodeTexImage")
texture.image = bpy.data.images.load(str(ROOT / "public/ui/wordmark.png"))
emission = nodes.new("ShaderNodeEmission")
emission.inputs["Strength"].default_value = 1.2
transparent = nodes.new("ShaderNodeBsdfTransparent")
mix = nodes.new("ShaderNodeMixShader")
output = nodes.new("ShaderNodeOutputMaterial")
links.new(texture.outputs["Color"], emission.inputs["Color"])
links.new(texture.outputs["Alpha"], mix.inputs[0])
links.new(transparent.outputs[0], mix.inputs[1])
links.new(emission.outputs[0], mix.inputs[2])
links.new(mix.outputs[0], output.inputs["Surface"])
title.data.materials.append(ink)
assert not any(obj.type == "FONT" for obj in banner.objects), "Banner must have no subtitle"
banner["purpose"] = "X header: 1500 wide x 500 high. Keep lettering above profile-picture overlap."

for scene in [avatar, banner]:
    for screen in bpy.data.screens:
        for area_view in screen.areas:
            if area_view.type == "VIEW_3D":
                area_view.spaces.active.region_3d.view_perspective = "CAMERA"
    name = "mossvale-x-avatar" if scene == avatar else "mossvale-x-banner"
    scene.render.filepath = str(OUT / (name + ("-draft" if PREVIEW else "") + ".png"))
bpy.context.window.scene = banner
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "mossvale-social.blend"), compress=True)
for scene in [avatar, banner]:
    bpy.context.window.scene = scene
    bpy.ops.render.render(write_still=True)
    path = Path(scene.render.filepath)
    width, height = struct.unpack(">II", path.read_bytes()[16:24])
    assert (width, height) == (int(scene.render.resolution_x * scene.render.resolution_percentage / 100),
                               int(scene.render.resolution_y * scene.render.resolution_percentage / 100))
    assert path.stat().st_size < 5_000_000
    print(f"VERIFIED {path.name}: {width} x {height}, {path.stat().st_size:,} bytes")
print("Mossvale social artwork rendered and checked.")
