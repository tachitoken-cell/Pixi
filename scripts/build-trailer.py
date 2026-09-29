"""Build Mossvale's 24-second cinematic scenes and render five inspection frames.

Blender --background --python scripts/build-trailer.py
Render saved scenes with Blender -b assets/trailer/mossvale-trailer.blend -S 01-forest -a.
"""
import bpy
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/trailer"
OUT.mkdir(parents=True, exist_ok=True)
random.seed(240911)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0


def rgba(value):
    channels = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in channels) + (1,)


def mat(name, hexcode, emission=0, metallic=0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba(hexcode)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = material.diffuse_color
    bsdf.inputs["Roughness"].default_value = .72
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Emission Color"].default_value = material.diffuse_color
    bsdf.inputs["Emission Strength"].default_value = emission
    return material


M = {"ground": mat("Mossy forest floor", "314C36"), "stone": mat("Old temple stone", "526C65"),
     "path": mat("Worn limestone", "A9A387"), "dark": mat("Deep night", "061715"),
     "gold": mat("Golden magic", "FFD96E", 5), "cyan": mat("Arcane light", "55E2F7", 6),
     "white": mat("Electric core", "D4F8FF", 12), "violet": mat("Rune particles", "BE8CFF", 4)}


def activate(scene):
    bpy.context.window.scene = scene


def key(obj, path, value, frame):
    setattr(obj, path, value)
    obj.keyframe_insert(data_path=path, frame=frame)


def empty(name, position=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = position
    return obj


def cube(name, position, size, material, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name, obj.scale = name, size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new("Crafted voxel edges", "BEVEL")
        modifier.width, modifier.segments = bevel, 1
        obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return obj


def aim(obj, at):
    obj.rotation_euler = (Vector(at) - obj.location).to_track_quat("-Z", "Y").to_euler()


def light(kind, name, position, energy, tint, size=4, target=(0, 0, 0)):
    bpy.ops.object.light_add(type=kind, location=position)
    obj = bpy.context.object
    obj.name, obj.data.energy, obj.data.color = name, energy, tint
    if kind == "AREA":
        obj.data.shape, obj.data.size = "DISK", size
    elif kind == "POINT":
        obj.data.shadow_soft_size = size
    elif kind == "SUN":
        obj.data.angle = .12
    aim(obj, target)
    return obj


def scene(name, duration, dark=False):
    result = bpy.data.scenes.new(name)
    activate(result)
    result.frame_start, result.frame_end = 1, duration
    result.render.engine = "BLENDER_EEVEE"
    result.eevee.taa_render_samples = 48
    result.render.resolution_x, result.render.resolution_y = 1920, 1080
    result.render.resolution_percentage = 100
    result.render.fps = 24
    result.render.image_settings.file_format = "PNG"
    result.render.image_settings.color_mode = "RGB"
    result.render.image_settings.compression = 15
    result.render.film_transparent = False
    result.render.use_motion_blur = True
    result.render.motion_blur_shutter = .25
    directory = OUT / "frames" / name
    directory.mkdir(parents=True, exist_ok=True)
    result.render.filepath = str(directory) + "/"
    result.view_settings.view_transform = "AgX"
    result.view_settings.look = "AgX - Medium High Contrast"
    result.world = bpy.data.worlds.new(name + " atmosphere")
    result.world.use_nodes = True
    background = result.world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (.045, .09, .11, 1) if dark else (.20, .30, .25, 1)
    background.inputs["Strength"].default_value = .3 if dark else .65
    graph = bpy.data.node_groups.new(name + " cinematic glow", "CompositorNodeTree")
    graph.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    result.compositing_node_group = graph
    layer = graph.nodes.new("CompositorNodeRLayers")
    layer.scene = result
    denoise = graph.nodes.new("CompositorNodeDenoise")
    glow = graph.nodes.new("CompositorNodeGlare")
    glow.inputs["Type"].default_value = "Fog Glow"
    glow.inputs["Quality"].default_value = "High"
    glow.inputs["Threshold"].default_value = 1.5
    glow.inputs["Strength"].default_value = .40
    output = graph.nodes.new("NodeGroupOutput")
    graph.links.new(layer.outputs["Image"], denoise.inputs["Image"])
    graph.links.new(denoise.outputs["Image"], glow.inputs["Image"])
    graph.links.new(glow.outputs["Image"], output.inputs["Image"])
    result["render_type"] = "Cinematic trailer with game assets and authored VFX; not captured gameplay."
    return result


def camera(scene, start, end, at_start, at_end, lens=35):
    bpy.ops.object.camera_add()
    obj = bpy.context.object
    obj.name = "Cinematic camera"
    obj.data.lens = lens
    obj.data.clip_end = 250
    focus = empty("Focus", at_start)
    obj.data.dof.use_dof = True
    obj.data.dof.focus_object = focus
    obj.data.dof.aperture_fstop = 6.3
    for frame, position, target in [(1, start, at_start), (scene.frame_end, end, at_end)]:
        key(obj, "location", position, frame)
        aim(obj, target)
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)
        key(focus, "location", target, frame)
    scene.camera = obj
    return obj


def library(filename, root_name, position=(0, 0, 0), scale=1, rotation=0):
    child_prefix = root_name.removeprefix("rootvault-")
    with bpy.data.libraries.load(str(ROOT / "assets/source" / filename), link=False) as (source, target):
        target.objects = [name for name in source.objects
                          if (name == root_name or name.startswith(child_prefix + "-"))
                          and not name.rsplit(".", 1)[-1].isdigit()]
    for obj in target.objects:
        if obj:
            bpy.context.scene.collection.objects.link(obj)
    roots = [obj for obj in target.objects if obj and obj.parent is None]
    root = next((obj for obj in roots if obj.name == root_name), roots[0])
    root.location, root.scale, root.rotation_euler = position, (scale,) * 3, (0, 0, rotation)
    return root, [obj for obj in target.objects if obj]


def forest():
    with bpy.data.libraries.load(str(ROOT / "assets/source/creator-scene.blend"), link=False) as (source, target):
        target.objects = [name for name in source.objects if name.startswith("creator-")]
    for obj in target.objects:
        bpy.context.scene.collection.objects.link(obj)
    light("SUN", "Warm woodland sun", (-8, -4, 14), 1.5, (1, .83, .57), target=(0, 8, 0))
    light("AREA", "Canopy fill", (3, -4, 10), 1800, (.75, .90, .80), 12, (0, 6, 1))
    for x in [-3, 3]:
        light("POINT", "Lantern glow", (x, 1.9, 1.65), 65, (1, .50, .12), .25)


def motes(scene, count, lower, upper, material, size=.04):
    for i in range(count):
        start = Vector([random.uniform(a, b) for a, b in zip(lower, upper)])
        end = start + Vector((random.uniform(-.6, .6), random.uniform(-.5, .8), random.uniform(.3, 1.5)))
        obj = cube("Drifting light motes", start, (size,) * 3, material)
        key(obj, "location", start, 1)
        key(obj, "location", end, scene.frame_end)
        key(obj, "rotation_euler", (0, 0, 0), 1)
        key(obj, "rotation_euler", (1.2, .8, 2), scene.frame_end)
        for f, s in [(1, .15), (random.randint(25, max(26, scene.frame_end - 20)), 1), (scene.frame_end, .10)]:
            key(obj, "scale", (s,) * 3, f)


def line(name, points, material, thickness=.025):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth, data.bevel_resolution = thickness, 2
    spline = data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1)
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(material)
    return obj


def pulse(obj, start, peak, end, maximum=1):
    for frame, scale in [(start, .001), (peak, maximum), (end, .001)]:
        key(obj, "scale", (scale,) * 3, frame)


def ring(name, center, radius, material, thickness=.025):
    points = [(radius * math.cos(i * math.tau / 64), radius * math.sin(i * math.tau / 64), 0) for i in range(65)]
    obj = line(name, points, material, thickness)
    obj.location = center
    return obj


def burst(scene, center, frame, count=60, material=None):
    for i in range(count):
        angle = random.random() * math.tau
        spread = random.uniform(1.2, 4)
        start = Vector(center)
        end = start + Vector((math.cos(angle) * spread, math.sin(angle) * spread, random.uniform(.5, 2.8)))
        obj = cube("Magic impact fragments", start, (.055,) * 3, material or M["cyan"])
        key(obj, "location", start, frame)
        key(obj, "location", end, frame + 22)
        pulse(obj, frame - 1, frame + 4, frame + 30, random.uniform(.5, 1.4))


def build_original_trailer():
    # 0:00–0:05 — a golden wisp leads the camera through the woodland entrance.
    s1 = scene("01-forest", 120)
    forest()
    camera(s1, (3.8, -12, 3.4), (-.5, -4.7, 2.5), (0, 5, 3.0), (0, 9, 3.1), 34)
    motes(s1, 70, (-6, -5, .6), (6, 16, 6), M["gold"], .035)
    wisp = cube("Guiding golden wisp", (0, -2, 2.6), (.18,) * 3, M["gold"], .015)
    wisp_light = light("POINT", "Wisp light", (0, -2, 2.6), 35, (1, .67, .22), .3)
    for f in range(1, 122, 10):
        t = (f - 1) / 120
        at = (math.sin(t * math.tau) * 1.2, -3 + 12 * t, 2.7 + .5 * math.sin(t * math.tau * 1.5))
        key(wisp, "location", at, f)
        key(wisp_light, "location", at, f)
        key(wisp, "rotation_euler", (t * 4, t * 3, t * 5), f)

    # 0:05–0:10 — the actual game's three callings in their woodland village.
    s2 = scene("02-village", 120)
    forest()
    library("village-kit.blend", "village-cottage", (-5.4, 5.6, 0), rotation=-.13)
    library("village-kit.blend", "village-inn", (5.4, 7, 0), rotation=.12)
    library("village-kit.blend", "village-stall", (-4.3, 0, 0), scale=.85)
    for name, at, turn in [("after-ranger-idle", (-1.6, -.1, 0), -.14),
                            ("after-knight-idle", (0, .3, 0), .03), ("after-mage-idle", (1.55, -.1, 0), .18)]:
        hero, _ = library("character-grips.blend", name, at, rotation=turn)
        for f in [1, 31, 61, 91, 120]:
            key(hero, "location", (at[0], at[1], at[2] + (.018 if f in [31, 91] else 0)), f)
    camera(s2, (6.3, -10.5, 4.5), (-3.2, -8.6, 3.3), (0, 1.3, 2.0), (0, 1.4, 2.1), 37)
    light("AREA", "Adventurer warm key", (-4, -6, 7), 1600, (1, .86, .64), 6, (0, 0, 1.5))
    motes(s2, 50, (-4, -1, 1), (4, 8, 5), M["gold"], .025)

    # 0:10–0:15 — awaken the Rootvault's rune with spiralling arcane energy.
    s3 = scene("03-rootvault", 120, True)
    cube("Temple floor", (0, 7, -.25), (26, 36, .5), M["stone"])
    for x in range(-3, 4):
        for y in range(-2, 7):
            cube("Temple paving", (x * 1.7, y * 1.7, .012), (1.61, 1.61, .06), M["path"] if (x + y) % 7 == 0 else M["stone"], .025)
    library("rootvault-kit.blend", "rootvault-arch", (0, 7, 0))
    library("rootvault-kit.blend", "rootvault-checkpoint", (0, 5.0, 0))
    for x in [-5, 5]:
        for y in [0, 5, 11]:
            library("rootvault-kit.blend", "rootvault-pillar", (x, y, 0))
        library("rootvault-kit.blend", "rootvault-brazier", (x * .6, 4.5, 0))
        light("POINT", "Ancient flame", (x * .6, 4.1, 2.5), 120, (1, .39, .11), .3)
    hero, _ = library("character-grips.blend", "after-staff-cast", (-1.8, 1.2, 0), rotation=math.pi - .2)
    camera(s3, (4.8, -7.4, 3.9), (2.8, -2.6, 3.4), (0, 5, 2.7), (0, 5.6, 2.7), 32)
    light("AREA", "Teal temple fill", (0, 5, 9), 1400, (.18, .65, .85), 8, (0, 4, 0))
    light("AREA", "Mage rim", (-4, -1, 5), 600, (.40, .65, 1), 5, (-1, 3, 2))
    orb = cube("Rune heart", (0, 5.4, 2.6), (.72,) * 3, M["cyan"], .035)
    for f in [1, 40, 80, 120]:
        key(orb, "rotation_euler", (.3 + f / 80, .2 + f / 110, f / 60), f)
        key(orb, "location", (0, 5.4, 2.6 + .12 * math.sin(f / 20)), f)
    light("POINT", "Rune heart light", (0, 5.4, 2.6), 150, (.12, .78, 1), .65)
    for j in range(3):
        energy = ring("Orbiting rune halo", (0, 5.4, 2.6), 1.05 + j * .3, M["cyan"], .014)
        for f in [1, 120]:
            key(energy, "rotation_euler", (.6 + j * .6, j * .75, f / 35 + j), f)
    for i in range(32):
        obj = cube("Spiralling rune fragments", (0, 0, 0), (.065,) * 3, M["violet"] if i % 3 == 0 else M["cyan"])
        for f in range(1, 122, 12):
            angle = i * math.tau / 16 + f / 24
            radius = 1.45 + .35 * math.sin(i)
            at = (math.cos(angle) * radius, 5.4 + math.sin(angle) * radius, 1 + (i % 8) * .4 + .25 * math.sin(f / 20))
            key(obj, "location", at, f)
    motes(s3, 40, (-5, 0, .4), (5, 12, 6), M["cyan"], .03)

    # 0:15–0:20.5 — Stormhorn's real attack animation with cinematic lightning and shockwaves.
    s4 = scene("04-stormhorn", 132, True)
    s4.eevee.shadow_pool_size = "1024"
    forest()
    s4.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .14
    for obj in s4.objects:
        if obj.type == "LIGHT" and obj.data.type == "SUN":
            obj.data.energy, obj.data.color = .45, (.5, .7, 1)
    boss, parts = library("monster-kit.blend", "stormhorn-behemoth", (0, 4.0, 0))
    for obj in parts:
        if obj.animation_data:
            for track in obj.animation_data.nla_tracks:
                track.mute = track.name != "stormhorn-behemoth-attack"
                for strip in track.strips:
                    strip.frame_start = 37
                    strip.frame_end = 109
                    strip.scale = 2.4
                    strip.extrapolation = "HOLD"
    hero, _ = library("character-grips.blend", "after-sword-strike", (-2.3, -2.0, 0), rotation=2.9)
    camera(s4, (7.7, -11, 3.2), (4.8, -7.6, 3.5), (0, 3.0, 3.1), (0, 3.0, 3.2), 33)
    light("AREA", "Stormhorn moon rim", (-5, 8, 11), 2200, (.25, .55, 1), 7, (0, 4, 3))
    light("AREA", "Battle foreground fill", (3, -6, 8), 1200, (.55, .70, 1), 8, (0, 3, 2))
    for offset in [0, 8, 17]:
        wave = ring("Expanding thunder shockwave", (0, 3, .15 + offset * .005), 1, M["cyan"], .038)
        for f, scale in [(71 + offset, .01), (75 + offset, 1), (95 + offset, 7.2), (108 + offset, 8)]:
            key(wave, "scale", (scale, scale, 1), f)
        shader = wave.data.materials[0]
        for f, hidden in [(1, True), (71 + offset, False), (109 + offset, True)]:
            key(wave, "hide_render", hidden, f)
    for i in range(7):
        start = Vector((-.85 if i % 2 else .85, 3.8, 6.3))
        end = Vector(((i - 3) * .85, 1.5 + (i % 3) * .65, .2))
        points = [tuple(start)]
        for j in range(1, 7):
            point = start.lerp(end, j / 6) + Vector((random.uniform(-.28, .28), random.uniform(-.2, .2), 0))
            points.append(tuple(point))
        bolt = line("Forked storm lightning", points, M["white"], .019)
        for f, hidden in [(1, True), (55 + i, False), (61 + i, True), (70 + i, False), (78 + i, True)]:
            key(bolt, "hide_render", hidden, f)
    burst(s4, (0, 2.8, .4), 73, 70, M["cyan"])
    flash = light("POINT", "Thunder impact flash", (0, 2.4, 3.4), 1, (.35, .80, 1), 1)
    for f, strength in [(1, 1), (70, 1), (73, 1500), (78, 90), (90, 1)]:
        key(flash.data, "energy", strength, f)
    motes(s4, 35, (-5, 0, .3), (5, 8, 5), M["cyan"], .035)

    # 0:20.5–0:24 — the approved wordmark resolves over the moving woodland.
    s5 = scene("05-logo", 84)
    forest()
    cam = camera(s5, (0, -11, 3.2), (0, -9.5, 3.2), (0, 6, 2.8), (0, 8, 2.8), 32)
    cam.data.dof.aperture_fstop = 3
    motes(s5, 85, (-6, -5, 1), (6, 9, 6), M["gold"], .045)
    bpy.ops.mesh.primitive_plane_add(size=2)
    logo = bpy.context.object
    logo.name = "Approved Mossvale wordmark"
    logo.parent, logo.location = cam, (0, .08, -5)
    logo.visible_shadow = False
    for f, scale in [(1, 2.60), (20, 2.44), (84, 2.36)]:
        key(logo, "scale", (scale, scale / 3, 1), f)
    ink = bpy.data.materials.new("Approved transparent wordmark")
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
    logo.data.materials.append(ink)
    cam.data.dof.use_dof = False

    shots = [s1, s2, s3, s4, s5]
    assert sum(s.frame_end for s in shots) == 24 * 24
    for shot in shots:
        shot.frame_set(1)
        assert shot.camera and shot.render.resolution_x == 1920
    activate(s1)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "mossvale-trailer.blend"), compress=True)
    for shot, frame in zip(shots, [60, 60, 60, 75, 42]):
        activate(shot)
        shot.frame_set(frame)
        shot.render.resolution_percentage = 50
        filename = shot.render.filepath
        shot.render.filepath = str(OUT / (shot.name + "-preview.png"))
        bpy.ops.render.render(write_still=True)
        shot.render.resolution_percentage = 100
        shot.render.filepath = filename
    print("TRAILER_READY: five shots, 576 frames, 1920x1080 at 24fps, packed logo.")


if __name__ == "__main__":
    build_original_trailer()
