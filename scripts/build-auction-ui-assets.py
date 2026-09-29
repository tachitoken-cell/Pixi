"""Blender-authored Mossvale auction UI icons; no raster source imagery.

Rebuild: /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-auction-ui-assets.py
Four named editable scenes produce transparent PNGs. Geometry stays at least
four pixels away from every canvas edge; no labels or UI borders are baked in.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/ui/auction'
SOURCE = ROOT / 'assets/source/auction-ui.blend'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4


def material(name, color, rough=.6, metal=0, grain=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    shader = nodes.get('Principled BSDF')
    rgb = tuple(linear(int(color[i:i + 2], 16) / 255) for i in (0, 2, 4))
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metal
    if grain:
        coord = nodes.new('ShaderNodeTexCoord')
        scale = nodes.new('ShaderNodeVectorMath')
        scale.operation = 'MULTIPLY'
        scale.inputs[1].default_value = (5, 40, 8)
        noise = nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 3
        noise.inputs['Detail'].default_value = 2
        ramp = nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (*[v * .6 for v in rgb], 1)
        ramp.color_ramp.elements[1].color = (*[min(1, v * 1.2) for v in rgb], 1)
        links = mat.node_tree.links
        links.new(coord.outputs['Generated'], scale.inputs[0])
        links.new(scale.outputs['Vector'], noise.inputs['Vector'])
        links.new(noise.outputs['Fac'], ramp.inputs[0])
        links.new(ramp.outputs['Color'], shader.inputs['Base Color'])
    return mat


oak = material('Warm carved oak', '885B32', .65, grain=True)
oak_light = material('Honey oak edge', 'B88A51', .62, grain=True)
oak_dark = material('Dark end grain', '493120', .75, grain=True)
brass = material('Worn Mossvale brass', 'C39843', .3, .68)
gold = material('Coin edge highlights', 'F5CD65', .28, .52)
gold_dark = material('Recessed coin stamp', '986C2C', .5, .3)
green = material('Forest green leather', '36553A', .86)
green_light = material('Moss green leather edges', '597C4B', .8)
leaf_green = material('Leaf green', '6A913D', .83)
leaf_light = material('Leaf lighter facets', 'ADC365', .8)
leather = material('Pouch ochre leather', 'A8783D', .9)
leather_dark = material('Leather pleat shade', '71502C', .9)
paper = material('Ledger ivory pages', 'E8D9AC', .9)
paper_dark = material('Ledger page seams', '9F9169', .9)
cyan = material('Spyglass turquoise lens', '71D8CC', .23, .18)
cyan_dark = material('Spyglass deep lens', '286879', .32, .2)
white = material('Lens reflection', 'E1FFF0', .23)


def scene(name, pixels, ortho):
    s = bpy.data.scenes.new(name)
    bpy.context.window.scene = s
    s.render.engine = 'CYCLES'
    s.cycles.samples = 64
    s.cycles.use_denoising = True
    s.render.resolution_x = pixels
    s.render.resolution_y = pixels
    s.render.resolution_percentage = 100
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGBA'
    s.render.image_settings.color_depth = '8'
    s.render.film_transparent = True
    s.render.filter_size = 1.1
    s.view_settings.view_transform = 'AgX'
    s.world = bpy.data.worlds.new(name + ' studio')
    s.world.use_nodes = True
    s.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.25, .29, .27, 1)
    s.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
    for pos, power, size, tint in [((-3, 4, 6), 680, 4, (1, .87, .68)), ((3, -1, 5), 260, 5, (.75, .87, 1))]:
        bpy.ops.object.light_add(type='AREA', location=pos)
        lamp = bpy.context.object
        lamp.data.energy, lamp.data.size, lamp.data.color = power, size, tint
        lamp.rotation_euler = (-lamp.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(0, 0, 10))
    s.camera = bpy.context.object
    s.camera.data.type = 'ORTHO'
    s.camera.data.ortho_scale = ortho
    root = bpy.data.objects.new(name + ' editable geometry', None)
    s.collection.objects.link(root)
    return s, root


def group(name, parent, at=(0, 0, 0), scale=1, angle=0):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent, obj.location = parent, at
    obj.scale = (scale,) * 3
    obj.rotation_euler.z = angle
    return obj


def box(name, pos, size, mat, parent, bevel=.018, angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.name, obj.parent, obj.scale = name, parent, size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler.z = angle
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Single carved bevel', 'BEVEL')
        mod.width, mod.segments = bevel, 1
        obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
    return obj


def disc(name, pos, radius, depth, mat, parent, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos)
    obj = bpy.context.object
    obj.name, obj.parent = name, parent
    obj.data.materials.append(mat)
    mod = obj.modifiers.new('Minted edge bevel', 'BEVEL')
    mod.width, mod.segments = .015, 1
    obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
    return obj


def leaf(parent, pos, length=.3, angle=0, metallic=False):
    half = length / 2
    vertices = [(0, -half, 0), (-half * .55, -.06, 0), (-half * .52, half * .38, 0), (0, half, 0),
                (half * .52, half * .38, 0), (half * .55, -.06, 0), (0, -half * .4, .025), (0, half * .4, .035)]
    faces = [(0, 1, 6), (1, 2, 7, 6), (2, 3, 7), (3, 4, 7), (4, 5, 6, 7), (5, 0, 6)]
    mesh = bpy.data.meshes.new('Carved leaf facets')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(gold_dark if metallic else leaf_green)
    mesh.materials.append(gold if metallic else leaf_light)
    for face in mesh.polygons:
        face.material_index = face.index % 2
    obj = bpy.data.objects.new('Minted leaf' if metallic else 'Woodland leaf', mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent, obj.location = parent, pos
    obj.rotation_euler.z = angle
    return obj


def coin(parent, at, radius=.35, angle=0):
    g = group('Faceted leaf coin', parent, at, angle=angle)
    disc('Coin milled rim', (0, 0, 0), radius, .095, brass, g)
    disc('Coin inset face', (0, 0, .052), radius * .82, .025, gold_dark, g)
    disc('Coin bright field', (0, 0, .068), radius * .73, .022, gold, g)
    leaf(g, (0, 0, .094), radius * 1.05, -.32, True)
    for turn in [0, math.pi / 2, math.pi, math.pi * 1.5]:
        x, y = math.cos(turn) * radius * .88, math.sin(turn) * radius * .88
        box('Coin mint notch', (x, y, .07), (.027, .042, .012), gold, g, .005, turn)
    return g


def gavel(parent, at=(0, 0, 0), scale=1, angle=.7):
    g = group('Oak auction gavel', parent, at, scale, angle)
    box('Tapered oak handle', (0, -.18, 0), (.18, 1.37, .22), oak, g, .035)
    box('Handle upper light', (-.036, -.14, .122), (.04, .93, .025), oak_light, g, .008)
    box('Handle end brass ferrule', (0, -.82, 0), (.23, .17, .265), brass, g, .025)
    box('Handle emerald wrap', (0, -.60, .023), (.212, .24, .235), green, g, .024)
    for y in [-.52, -.60, -.68]:
        box('Raised leather wrap', (0, y, .155), (.19, .024, .023), green_light, g, .006, -.14)
    box('Carved oak gavel head', (0, .52, .025), (1.13, .43, .44), oak, g, .055)
    box('Head front bevel highlight', (0, .657, .255), (.88, .048, .025), oak_light, g, .010)
    for x in [-.53, .53]:
        box('Brass striking cap', (x, .52, .025), (.19, .515, .49), brass, g, .045)
        box('Brass striking cap highlight', (x - .03, .57, .280), (.063, .35, .016), gold, g, .008)
    for x in [-.38, .38]:
        box('Brass head band', (x, .52, .03), (.055, .465, .465), brass, g, .009)
    leaf(g, (0, .52, .27), .25, -.2, True)
    return g


def pouch(parent, at=(0, 0, 0), scale=1):
    g = group('Merchant coin pouch', parent, at, scale)
    # An eight-sided body with stepped silhouette and a visibly gathered neck.
    rings = [(-.63, .35, .19), (-.49, .47, .24), (.04, .48, .23), (.34, .29, .17), (.49, .34, .16), (.58, .27, .13)]
    vertices = []
    for y, rx, rz in rings:
        for i in range(8):
            turn = math.tau * i / 8 + math.pi / 8
            vertices.append((math.cos(turn) * rx, y, math.sin(turn) * rz))
    faces = [tuple(range(7, -1, -1))]
    for r in range(len(rings) - 1):
        for i in range(8):
            faces.append((r * 8 + i, r * 8 + (i + 1) % 8, (r + 1) * 8 + (i + 1) % 8, (r + 1) * 8 + i))
    mesh = bpy.data.meshes.new('Pouch pleated leather')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(leather)
    mesh.materials.append(leather_dark)
    for face in mesh.polygons:
        face.material_index = int(face.index % 8 in [0, 3])
    obj = bpy.data.objects.new('Faceted hollow pouch', mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = g
    box('Mossgreen drawstring band', (0, .33, .01), (.60, .10, .33), green, g, .025)
    box('Cord brass knot', (0, .30, .22), (.12, .12, .10), gold, g, .015, .6)
    for x, angle in [(-.105, -.22), (.105, .22)]:
        box('Hanging drawstring', (x, .08, .255), (.04, .39, .045), green_light, g, .008, angle)
    leaf(g, (0, -.25, .245), .35, -.20, True)
    return g


crest, active = scene('Auction crest', 384, 3.3)
gavel(active, (-.04, .25, .08), 1.28, .69)
for at, radius, turn in [((-.59, -.74, -.04), .37, -.2), ((-.17, -.82, .10), .40, .12), ((.26, -.83, .23), .39, -.2)]:
    coin(active, at, radius, turn)
# A short timber sound block grounds the crest without a framed background.
box('Oak auction sound block', (-.11, -1.08, -.10), (1.47, .22, .61), oak_dark, active, .05)
box('Sound block brass footing', (-.11, -1.17, -.10), (1.55, .075, .65), brass, active, .02)
for x, y, turn, length in [(-1.10, -.81, -.70, .42), (-1.26, -.47, -.38, .47), (-1.19, -.17, -.08, .34),
                          (.90, -.92, .82, .40), (1.12, -.69, .50, .38)]:
    leaf(active, (x, y, .02), length, turn)

shopping, active = scene('Shopping tab', 96, 2.55)
spyglass = group('Merchant shopping spyglass', active, (-.08, .31, .0), angle=.47)
box('Leather-covered optical barrel', (-.12, 0, 0), (1.03, .36, .40), green, spyglass, .045)
box('Barrel upper highlight', (-.12, .13, .24), (.86, .04, .025), green_light, spyglass, .008)
for x, width, height in [(-.72, .21, .30), (-.46, .14, .39), (.32, .15, .44), (.55, .26, .57)]:
    box('Stepped brass telescope sleeve', (x, 0, .04), (width, height, height), brass, spyglass, .035)
box('Eyepiece dark glass', (-.80, 0, .10), (.10, .20, .22), cyan_dark, spyglass, .02)
disc('Front brass lens bezel', (.64, 0, .35), .30, .10, gold, spyglass)
disc('Deep optical lens rim', (.64, 0, .407), .24, .03, cyan_dark, spyglass)
disc('Turquoise glass face', (.64, 0, .43), .205, .02, cyan, spyglass)
box('Glass reflection', (.585, .07, .46), (.055, .18, .018), white, spyglass, .012, -.5)
coin(active, (-.32, -.58, .18), .40, -.13)

selling, active = scene('Selling tab', 96, 2.40)
pouch(active, (-.29, .08, 0), 1.28)
coin(active, (.49, -.29, .20), .37, -.2)
coin(active, (.24, -.60, .29), .33, .14)

auctions, active = scene('Own auctions tab', 96, 2.6)
ledger = group('Auction ledger', active, (-.19, .14, -.02), angle=-.14)
box('Back leather book cover', (0, 0, -.08), (1.22, 1.65, .12), green, ledger, .055)
box('Ivory ledger page block', (.05, 0, .025), (1.01, 1.47, .16), paper, ledger, .018)
for y in [-.64, -.56, -.48, .48, .56, .64]:
    box('Fine exposed page edge', (.57, y, .064), (.025, .012, .12), paper_dark, ledger, .0)
box('Front forest leather cover', (-.025, .015, .147), (1.20, 1.64, .11), green, ledger, .045)
box('Raised leather spine', (-.51, .01, .19), (.18, 1.61, .16), green_light, ledger, .032)
for y in [-.64, .64]:
    for x in [-.35, .43]:
        box('Ledger brass corner', (x, y, .228), (.21, .16, .04), brass, ledger, .014)
box('Ledger brass clasp', (.55, .12, .23), (.23, .23, .065), gold, ledger, .020)
leaf(ledger, (.04, .25, .226), .47, -.3, True)
gavel(active, (.36, -.25, .45), .72, -.61)

OUT.mkdir(parents=True, exist_ok=True)
SOURCE.parent.mkdir(parents=True, exist_ok=True)
exports = [(crest, 'crest', 384), (shopping, 'shopping', 96), (selling, 'selling', 96), (auctions, 'auctions', 96)]
for current, name, pixels in exports:
    current.render.filepath = str(OUT / (name + '.png'))
    current['asset_contract'] = f'{pixels}x{pixels} RGBA; transparent unframed icon; no letters; at least4px clear canvas margin'
    current['authoring'] = 'Original Mossvale icon modeled in Blender from oak, brass, leather and leaf geometry.'
bpy.context.preferences.filepaths.save_version = 0
bpy.context.window.scene = crest
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)
for current, name, pixels in exports:
    bpy.context.window.scene = current
    bpy.ops.render.render(write_still=True)
    png = bpy.data.images.load(str(OUT / (name + '.png')), check_existing=False)
    assert tuple(png.size) == (pixels, pixels), 'Exact UI dimensions'
    values = list(png.pixels)
    alpha = [values[i * 4 + 3] for i in range(pixels * pixels)]
    occupied = [(i % pixels, i // pixels) for i, a in enumerate(alpha) if a > .01]
    assert occupied and min(alpha) == 0 and max(alpha) > .99, 'Real transparent background and solid artwork'
    left, right = min(x for x, y in occupied), max(x for x, y in occupied)
    bottom, top = min(y for x, y in occupied), max(y for x, y in occupied)
    assert min(left, bottom, pixels - 1 - right, pixels - 1 - top) >= 4, f'{name}: artwork clipped or insufficient padding'
    bpy.data.images.remove(png)
    print('AUCTION_UI_CHECK', name, pixels, 'alphaBounds', (left, bottom, right, top), 'bytes', (OUT / (name + '.png')).stat().st_size)
assert SOURCE.exists() and SOURCE.stat().st_size > 10000
print('AUCTION_UI_SOURCE', SOURCE, SOURCE.stat().st_size)
