"""Build 31 original, solid Cleric spell sculptures for instanced animation.

blender --background --python scripts/build-spell-models-cleric.py
Every object is a complete colored centerpiece, not a collection of wire outlines.
Flight objects face +Z and are centered; blessings are Y-up with grounded origins.
"""
import math
import sys
from pathlib import Path
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import spell_model_tools as m
from spell_model_tools import *

reset()
WHITE = (1, .99, .92, 1)
BRONZE = (.38, .19, .045, 1)
PALE = (.68, .9, .76, 1)
FLIGHT = {'smite', 'searing-light', 'binding-light', 'holy-fire', 'penance', 'chains-of-light',
          'radiant-burst', 'sacred-flame', 'holy-word-chastise', 'judgment', 'holy-lance', 'wrath-of-heaven'}
counts = {}


def petal(start, end, width, color=PEARL, bend=(0, 0, .08), rows=7):
    """Closed, curved blade with a raised keel, beveled edges and a gilded vein."""
    a, b, curve = Vector(start), Vector(end), Vector(bend)
    direction = (b - a).normalized()
    side = direction.cross(Vector((0, 0, 1)))
    if side.length < .05:
        side = direction.cross(Vector((0, 1, 0)))
    side.normalize()
    normal = side.cross(direction).normalized()
    verts = []
    centers = []
    for i in range(rows + 1):
        q = i / rows
        center = a.lerp(b, q) + curve * math.sin(q * math.pi)
        centers.append(center + normal * width * .16 * math.sin(q * math.pi))
        w = width * math.sin(q * math.pi) ** .8
        verts.extend([center - side * w, center + normal * w * .24, center + side * w, center - normal * w * .16])
    for edge in range(4):
        add(verts, [(i * 4 + edge, i * 4 + (edge + 1) % 4, (i + 1) * 4 + (edge + 1) % 4, (i + 1) * 4 + edge) for i in range(rows)], tint(color, [ .92, 1, .59, .67][edge]))
    tube([centers[0], centers[rows // 2], centers[-1]], [.008, .012, .001], mix(color, WHITE, .65), 4)


def crest(center, size, color=GOLD):
    x, y, z = center
    w, h = size
    outline = [(0, -.53), (-.39, -.18), (-.47, .28), (-.28, .46), (0, .54), (.28, .46), (.47, .28), (.39, -.18)]
    plate([(x + px * w, y + py * h, z) for px, py in outline], .10, color)
    plate([(x + px * w * .81, y + py * h * .82, z + .07) for px, py in outline], .045, PEARL)
    crystal((x, y - h * .17, z + .11), (x, y + h * .29, z + .11), w * .09, MINT, 6)
    for side in [-1, 1]:
        petal((x + side * w * .04, y, z + .13), (x + side * w * .31, y + h * .16, z + .13), w * .055, GOLD, (0, .045, .018), 4)


def cross(center, size, color=PEARL):
    x, y, z = center
    box((x, y, z), (size * .18, size, size * .15), GOLD)
    box((x, y + size * .13, z), (size * .66, size * .17, size * .15), GOLD)
    box((x, y, z + size * .086), (size * .085, size * .86, size * .05), color)
    box((x, y + size * .13, z + size * .086), (size * .54, size * .075, size * .05), color)
    ellipsoid((x, y + size * .13, z + size * .14), (size * .105,) * 3, MINT, 8, 4)


def wing(root, side, size=1, color=PEARL, feathers=6):
    x, y, z = root
    petal((x, y, z), (x + side * size * .77, y + size * .56, z - .05), size * .16, GOLD, (0, .14, .03))
    for i in range(feathers):
        q = i / max(1, feathers - 1)
        start = (x + side * size * (.08 + q * .63), y + size * (.08 + q * .42), z)
        end = (x + side * size * (.33 + q * .75), y + size * (.17 - q * .6), z - .07)
        petal(start, end, size * (.095 - q * .017), mix(color, GOLD, q * .16), (side * .06, .05, .035), 6)


def finish_model(id, y_forward=False):
    if y_forward:
        m.vertices = [(x, -z, y) for x, y, z in m.vertices]
    if id in FLIGHT:
        low = [min(v[i] for v in m.vertices) for i in range(3)]
        high = [max(v[i] for v in m.vertices) for i in range(3)]
        midpoint = [(low[i] + high[i]) / 2 for i in range(3)]
        scale = 1.8 / max(high[i] - low[i] for i in range(3))
        m.vertices = [tuple((v[i] - midpoint[i]) * scale for i in range(3)) for v in m.vertices]
    else:
        bottom = min(0, min(v[1] for v in m.vertices))
        ceiling = max(v[1] - bottom for v in m.vertices)
        radius = max(math.hypot(v[0], v[2]) for v in m.vertices)
        scale = min(1, 2.3 / max(.01, ceiling), (1 if id in ['holy-nova', 'cleansing-radiance'] else 1.2) / max(.01, radius))
        m.vertices = [(x * scale, (y - bottom) * scale, z * scale) for x, y, z in m.vertices]
    counts[id] = sum(len(face) - 2 for face in m.faces)
    finish(id)


# SMITE — a pearlescent dart set in four substantial feathered gold barbs.
crystal((0, 0, -.58), (0, 0, .91), .18, WHITE, 10)
ring((0, 0, -.12), .21, .065, GOLD, 'z', 16)
for side in [-1, 1]:
    petal((side * .1, 0, -.4), (side * .5, 0, .1), .16, GOLD, (0, .09, -.08))
    petal((0, side * .1, -.4), (0, side * .45, .1), .14, PEARL, (.05, 0, -.08))
ellipsoid((0, 0, .12), (.18, .18, .28), PEARL, 12, 6)
finish_model('smite')

# HEAL — bound illuminated tome, sculpted paper stacks and a visibly turning page.
for side in [-1, 1]:
    box((side * .36, .96, 0), (.72, .12, 1.05), BRONZE)
    box((side * .36, 1.015, 0), (.67, .055, .99), GOLD)
    for page in range(4):
        # Rectangular, individually curved paper sheets retain a recognisable book silhouette.
        rows = []
        for i in range(7):
            q = i / 6
            x = side * (.025 + q * .63)
            y = 1.05 + page * .016 + .05 * math.sin(q * math.pi) + .055 * q * q
            rows.extend([(x, y, -.47), (x, y, .47), (x, y - .008, .47), (x, y - .008, -.47)])
        panels = [(i * 4 + e, (i + 1) * 4 + e, (i + 1) * 4 + (e + 1) % 4, i * 4 + (e + 1) % 4) for i in range(6) for e in range(4)]
        add(rows, panels + [(0, 1, 2, 3), (24, 27, 26, 25)], mix(PEARL, WHITE, page / 4))
    for j in range(4):
        box((side * .36, 1.18, -.25 + j * .16), (.32, .016, .019), GOLD)
tube([(0, .98, -.55), (0, 1.15, 0), (0, .98, .55)], .052, GOLD)
turning_page = []
for i in range(8):
    q = i / 7
    x, y = math.sin(q * 1.4) * .35, 1.11 + q * .56
    turning_page.extend([(x, y, -.44), (x, y, .44), (x + .009, y, .44), (x + .009, y, -.44)])
add(turning_page, [(i * 4 + e, (i + 1) * 4 + e, (i + 1) * 4 + (e + 1) % 4, i * 4 + (e + 1) % 4) for i in range(7) for e in range(4)], WHITE)
ellipsoid((0, 1.18, .03), (.09, .035, .13), MINT, 10, 5)
finish_model('heal')

# HOLY NOVA — a solid sunburst medallion with a luminous dome and twelve broad rays.
ellipsoid((0, .14, 0), (.37, .23, .37), WHITE, 20, 8)
ring((0, .1, 0), .4, .09, GOLD, 'y', 24)
for i in range(12):
    q = i * TAU / 12
    petal((math.cos(q) * .32, .12, math.sin(q) * .32), (math.cos(q) * .99, .08, math.sin(q) * .99), .13 if i % 2 else .18, PEARL if i % 2 else GOLD, (0, .16, 0), 5)
finish_model('holy-nova')

# FLASH HEAL — dimensional pearl cross with flared crystal ends and mint heart.
cross((0, 1.14, 0), 1.34, WHITE)
for x, y in [(-.56, 1.31), (.56, 1.31), (0, 1.89), (0, .39)]:
    ellipsoid((x, y, 0), (.12, .12, .12), PEARL, 10, 5)
for side in [-1, 1]:
    petal((side * .12, .97, -.03), (side * .57, .63, .08), .17, MINT, (0, .08, .03))
finish_model('flash-heal')

# POWER WORD: SHIELD — wide embossed heraldic shield with carved leafy shoulders.
crest((0, 1.07, .14), (1.46, 1.79))
for side in [-1, 1]:
    wing((side * .4, 1.34, .07), side, .49, WHITE, 4)
    ellipsoid((side * .39, 1.66, .25), (.085, .085, .045), MINT, 8, 4)
cross((0, 1.1, .29), .55, WHITE)
finish_model('power-word-shield')

# RENEW — twisted tree of life, three growing tiers and thick fresh leaves.
tube([(0, .06, 0), (-.07, .65, .04), (.05, 1.27, -.01), (0, 1.93, 0)], [.12, .09, .064, .025], GOLD, 9)
for tier in range(3):
    y = .63 + tier * .44
    for side in [-1, 1]:
        tube([(0, y, 0), (side * .24, y + .16, .02), (side * .49, y + .27, .03)], [.05, .036, .012], GOLD, 7)
        petal((side * .12, y + .03, .02), (side * .61, y + .36, .04), .17, MINT, (0, .08, .04))
        petal((side * .3, y + .17, .02), (side * .43, y + .51, -.02), .10, PALE)
ellipsoid((0, 1.95, 0), (.12, .18, .12), WHITE, 10, 6)
for i in range(4):
    q = i * TAU / 4
    tube([(0, .14, 0), (math.cos(q) * .28, .055, math.sin(q) * .28), (math.cos(q) * .52, .015, math.sin(q) * .52)], [.07, .04, .003], GOLD, 6)
finish_model('renew')

# SEARING LIGHT — an almond-shaped golden lens focusing a white spear of light.
for side in [-1, 1]:
    petal((-.63, 0, 0), (.63, 0, 0), .14, GOLD, (0, side * .28, -.02))
ellipsoid((0, 0, .04), (.25, .2, .16), WHITE, 16, 8)
crystal((0, 0, -.62), (0, 0, .92), .08, PEARL, 8)
for side in [-1, 1]:
    petal((side * .14, 0, -.65), (side * .29, 0, -.12), .075, GOLD)
finish_model('searing-light')

# BINDING LIGHT — a dense Celtic knot with four curled, tapered ribbon ends.
for side in [-1, 1]:
    points = [(side * (.2 + .14 * math.sin(i / 12 * TAU)), .16 * math.sin(i / 12 * TAU * 2), -.65 + i / 12 * 1.25) for i in range(13)]
    tube(points, [.028 + .055 * math.sin(i / 12 * math.pi) for i in range(13)], PEARL if side < 0 else GOLD, 8)
    petal((side * .13, 0, -.08), (side * .55, .22, .32), .2, GOLD, (0, -.18, .09))
    petal((side * .13, 0, -.08), (side * .48, -.24, -.43), .17, PEARL, (0, .15, -.12))
ellipsoid((0, 0, .02), (.18, .16, .2), WHITE, 10, 6)
finish_model('binding-light')

# PRAYER OF HEALING — sculpted rosary pearls and a substantial hanging cross.
for i in range(14):
    q = i * TAU / 14
    ellipsoid((math.cos(q) * .68, 1.28 + math.sin(q) * .7, 0), (.1, .105, .1), WHITE if i % 3 else GOLD, 8, 4)
ring((0, 1.28, 0), .68, .019, BRONZE, 'z', 28)
cross((0, .38, .05), .48, PEARL)
for side in [-1, 1]:
    petal((side * .12, .58, -.02), (side * .4, .35, -.03), .075, MINT)
finish_model('prayer-of-healing')

# HOLY FIRE — an ivory candle, gilded wax drips and a layered flame along travel.
lathe((0, 0, 0), [(0, -.61), (.19, -.61), (.19, -.12), (.16, -.06), (0, -.08)], PEARL, 18)
ring((0, -.53, 0), .22, .055, GOLD, 'y', 20)
for i in range(5):
    q = i * TAU / 5
    tube([(math.cos(q) * .18, -.11, math.sin(q) * .18), (math.cos(q) * .2, -.23 - (i % 3) * .065, math.sin(q) * .2)], [.04, .026], WHITE, 6)
flame((0, .28, 0), (.61, .94, .57), GOLD, .25)
finish_model('holy-fire', y_forward=True)

# PENANCE — three thick scriptural tablets, ivory faces and raised golden verses.
for i in range(3):
    z = .37 - i * .4
    box(((i - 1) * .08, 0, z), (.62, .83, .12), GOLD)
    box(((i - 1) * .08, 0, z + .075), (.5, .69, .035), PEARL)
    for row in range(4):
        box(((i - 1) * .08, .2 - row * .13, z + .104), (.31 - (row % 2) * .08, .033, .025), BRONZE if row else MINT)
    ellipsoid(((i - 1) * .08, -.32, z + .11), (.085, .075, .04), WHITE, 8, 4)
    for side in [-1, 1]:
        tube([(side * .32 + (i - 1) * .08, -.35, z), (side * .35 + (i - 1) * .08, 0, z), (side * .32 + (i - 1) * .08, .35, z)], [.03, .04, .03], WHITE, 6)
finish_model('penance')

# HOLY WORD: SERENITY — open porcelain lotus with a mint inner cup.
for layer, count in [(0, 8), (1, 5)]:
    for i in range(count):
        q = i * TAU / count + layer * .3
        radius = .78 if not layer else .46
        petal((math.cos(q) * .09, .47, math.sin(q) * .09), (math.cos(q) * radius, .72 + layer * .42, math.sin(q) * radius), .25 if not layer else .18, WHITE if not layer else MINT, (0, -.12, 0))
ellipsoid((0, .73, 0), (.22, .24, .22), PEARL, 16, 8)
lathe((0, .25, 0), [(0, 0), (.18, 0), (.26, .11), (.2, .18), (0, .18)], GOLD, 16)
finish_model('holy-word-serenity')

# DIVINE AEGIS — six curved protective panels buttress a vaulted pearl crown.
for i in range(6):
    q = i * TAU / 6
    x, z = math.cos(q), math.sin(q)
    petal((x * .87, .08, z * .87), (x * .18, 1.98, z * .18), .3, PEARL if i % 2 else PALE, (x * .3, .1, z * .3), 9)
    tube([(x, .08, z), (x * 1.04, .85, z * 1.04), (x * .62, 1.72, z * .62), (0, 2.15, 0)], [.07, .062, .05, .02], GOLD, 7)
ellipsoid((0, 2.07, 0), (.18, .2, .18), WHITE, 12, 6)
finish_model('divine-aegis')

# CHAINS OF LIGHT — chunky interlocking oval links and a jeweled locking clasp.
for i in range(7):
    q = i * .6
    x = math.sin(q) * .12
    ring((x, 0, -.64 + i * .21), .15, .046, GOLD if i % 2 else PEARL, 'x' if i % 2 else 'y', 12)
crest((0, 0, .49), (.52, .55), GOLD)
for side in [-1, 1]:
    crystal((side * .11, 0, .56), (side * .15, 0, .79), .065, WHITE, 6)
finish_model('chains-of-light')

# CIRCLE OF HEALING — a thick laurel wreath with six luminous flower heads.
for i in range(18):
    q = i * TAU / 18
    petal((math.cos(q) * .69, .1, math.sin(q) * .69), (math.cos(q + .26) * .99, .15, math.sin(q + .26) * .99), .15, MINT if i % 2 else PALE, (0, .11, 0), 5)
for i in range(6):
    q = i * TAU / 6
    ellipsoid((math.cos(q) * .78, .21, math.sin(q) * .78), (.095, .075, .095), PEARL, 8, 4)
ring((0, .055, 0), .75, .032, GOLD, 'y', 24)
finish_model('circle-of-healing')

# DIVINE HYMN — a complete flared bell, thick lip, inner shell and visible clapper.
lathe((0, .43, 0), [(.58, 0), (.63, .06), (.6, .13), (.42, .28), (.32, .66), (.23, .93), (.12, 1.02), (0, 1.02)], GOLD, 28)
lathe((0, .47, 0), [(.55, 0), (.41, .21), (.29, .58), (.17, .86), (0, .9)], PEARL, 24)
ring((0, .49, 0), .6, .055, WHITE, 'y', 24)
tube([(0, .57, 0), (0, 1.29, 0)], .043, BRONZE, 8)
ellipsoid((0, .42, 0), (.15, .16, .15), WHITE, 12, 6)
ring((0, 1.65, 0), .17, .055, GOLD, 'z', 16)
for side in [-1, 1]:
    petal((side * .09, 1.36, .06), (side * .43, 1.08, .17), .10, WHITE)
finish_model('divine-hymn')

# RADIANT BURST — a solid star of interleaved spear crystals around a brilliant core.
ellipsoid((0, 0, 0), (.23, .23, .23), WHITE, 16, 8)
for i in range(8):
    q = i * TAU / 8
    crystal((math.cos(q) * .12, math.sin(q) * .12, 0), (math.cos(q) * .79, math.sin(q) * .79, .025), .13 if i % 2 else .18, PEARL if i % 2 else GOLD, 7)
for side in [-1, 1]:
    crystal((0, 0, side * .08), (0, 0, side * .6), .15, WHITE, 8)
finish_model('radiant-burst')

# GUARDIAN LIGHT — a heavy shield sentinel with a helmet and two solid guard swords.
crest((0, .99, .12), (1.15, 1.65), GOLD)
ellipsoid((0, 1.91, .05), (.21, .26, .18), PEARL, 12, 7)
box((0, 1.9, .22), (.3, .038, .035), BRONZE)
for side in [-1, 1]:
    crystal((side * .65, .26, .1), (side * .47, 1.92, .1), .12, WHITE, 7)
    box((side * .62, .56, .1), (.43, .085, .12), GOLD)
    ellipsoid((side * .65, .26, .1), (.08, .09, .08), MINT, 8, 4)
finish_model('guardian-light')

# GREATER HEAL — sculpted chalice with a luminous pool and substantial fountain jets.
lathe((0, .05, 0), [(0, 0), (.32, 0), (.35, .08), (.21, .16), (.075, .24), (.065, .55), (.18, .62), (.43, .82), (.5, 1.06), (.43, 1.06), (.36, .86), (.16, .73)], GOLD, 24)
ellipsoid((0, 1.025, 0), (.41, .035, .41), MINT, 18, 5)
ring((0, 1.115, 0), .48, .04, WHITE, 'y', 24)
for i in range(5):
    q = i * TAU / 5
    x, z = math.cos(q), math.sin(q)
    tube([(0, 1.04, 0), (x * .2, 1.62, z * .2), (x * .46, 1.86, z * .46), (x * .69, 1.52, z * .69)], [.055, .042, .031, .008], WHITE if i % 2 else MINT, 7)
    ellipsoid((x * .72, 1.38, z * .72), (.065, .11, .065), PEARL, 8, 4)
finish_model('greater-heal')

# SACRED FLAME — fully feathered phoenix body, hooked beak and three curling tail plumes.
ellipsoid((0, 0, .08), (.22, .2, .4), GOLD, 14, 8)
ellipsoid((0, .05, .42), (.15, .16, .17), PEARL, 12, 6)
crystal((0, .05, .44), (0, .02, .77), .075, WHITE, 6)
for side in [-1, 1]:
    for i in range(6):
        q = i / 5
        petal((side * (.15 + q * .18), .02, .06 - q * .18), (side * (.52 + q * .54), .06 + .08 * math.sin(q * math.pi), -.08 - q * .55), .125 - q * .025, PEARL if i % 2 else GOLD, (0, .13, .02), 6)
    ellipsoid((side * .13, .09, .5), (.035, .045, .035), WHITE, 8, 4)
for i in [-1, 0, 1]:
    petal((i * .09, 0, -.22), (i * .36, .1, -.91), .10, GOLD if i else WHITE, (i * .1, -.08, 0))
finish_model('sacred-flame')

# PRAYER OF MENDING — three pearl hearts connected by thick woven restorative stitches.
for i in range(3):
    q, nq = i * TAU / 3, (i + 1) * TAU / 3
    x, z = math.cos(q) * .57, math.sin(q) * .57
    nx, nz = math.cos(nq) * .57, math.sin(nq) * .57
    ellipsoid((x - .045, .92, z), (.15, .16, .14), WHITE, 10, 5)
    ellipsoid((x + .045, .92, z), (.15, .16, .14), MINT, 10, 5)
    crystal((x, .92, z), (x, .62, z), .14, PEARL, 6)
    tube([(x, .82, z), ((x + nx) / 2, 1.22, (z + nz) / 2), (nx, .82, nz)], [.055, .044, .055], GOLD, 8)
    petal((x, .73, z), (x * 1.42, .51, z * 1.42), .105, MINT)
finish_model('prayer-of-mending')

# HOLY WORD: CHASTISE — an ornamented ivory gavel, carved grip and jeweled striking face.
tube([(0, -.66, 0), (0, .21, 0)], [.072, .09], GOLD, 10)
for i in range(5):
    ring((0, -.56 + i * .115, 0), .076, .022, BRONZE, 'y', 12)
tube([(-.42, .27, 0), (-.29, .27, 0), (.29, .27, 0), (.42, .27, 0)], [.21, .17, .17, .21], PEARL, 12)
for side in [-1, 1]:
    ring((side * .37, .27, 0), .215, .04, GOLD, 'x', 18)
    ellipsoid((side * .43, .27, 0), (.025, .15, .15), WHITE, 12, 6)
ellipsoid((0, -.67, 0), (.11, .1, .11), MINT, 10, 5)
finish_model('holy-word-chastise', y_forward=True)

# SANCTUARY — substantial marble chapel pillars and a pointed, deeply beveled gold arch.
for side in [-1, 1]:
    box((side * .78, .11, 0), (.4, .22, .43), GOLD)
    lathe((side * .78, .22, 0), [(.17, 0), (.14, .1), (.14, 1.06), (.21, 1.13), (.19, 1.22)], PEARL, 16)
    tube([(side * .78, 1.42, 0), (side * .62, 1.82, 0), (side * .31, 2.08, 0), (0, 2.29, 0)], [.16, .145, .11, .07], GOLD, 10)
    petal((side * .76, .42, .13), (side * 1.07, 1.12, .03), .14, WHITE, (0, .05, .03))
    crystal((side * .78, .66, .15), (side * .78, 1.17, .15), .075, MINT, 6)
ellipsoid((0, 2.24, 0), (.1, .14, .1), WHITE, 10, 5)
finish_model('sanctuary')

# JUDGMENT — balanced golden scales with deep solid pans and a white central finial.
lathe((0, -.72, 0), [(0, 0), (.25, 0), (.25, .08), (.09, .19), (.065, 1.11), (.14, 1.16), (0, 1.23)], GOLD, 14)
tube([(-.71, .39, 0), (0, .43, 0), (.71, .39, 0)], [.065, .08, .065], PEARL, 8)
for side in [-1, 1]:
    x = side * .58
    lathe((x, -.2, 0), [(0, 0), (.12, .03), (.24, .15), (.25, .23), (.2, .23), (.1, .09), (0, .07)], GOLD, 18)
    for z in [-.15, .15]:
        tube([(x, .4, 0), (x - .17, .035, z), (x + .17, .035, z), (x, .4, 0)], .025, PEARL, 6)
    ellipsoid((x, -.04, 0), (.08, .065, .08), WHITE, 8, 4)
ellipsoid((0, .58, 0), (.12, .15, .12), MINT, 10, 6)
finish_model('judgment')

# SALVATION — two thick illuminated doors open inward between carved pearl pillars.
for side in [-1, 1]:
    x = side * .83
    lathe((x, .05, 0), [(.2, 0), (.2, .13), (.12, .2), (.12, 1.88), (.2, 1.96), (.16, 2.04), (0, 2.12)], GOLD, 14)
    plate([(x, .2, 0), (side * .19, .2, .51), (side * .19, 1.98, .51), (x, 1.98, 0)], .11, PEARL)
    for j in range(3):
        y = .37 + j * .51
        tube([(x, y, .08), (side * .19, y, .58)], .055, GOLD, 7)
    petal((side * .58, .71, .25), (side * .46, 1.74, .38), .15, MINT, (side * -.08, 0, .04))
    ellipsoid((side * .3, 1.05, .59), (.055, .085, .055), GOLD, 8, 4)
cross((0, 2.0, -.08), .38, WHITE)
finish_model('salvation')

# HOLY LANCE — long gilded spear with an inset ivory blade and swallowtail streamers.
tube([(0, 0, -.91), (0, 0, .29)], [.035, .058], GOLD, 10)
crystal((0, 0, .12), (0, 0, .99), .15, GOLD, 8)
crystal((0, -.025, .19), (0, -.025, .94), .105, WHITE, 8)
for side in [-1, 1]:
    petal((side * .08, 0, .19), (side * .18, .04, .51), .075, PEARL)
    petal((side * .075, 0, .12), (side * .35, .04, -.62), .10, PEARL if side < 0 else GOLD, (side * .12, .12, 0), 9)
ring((0, 0, .11), .12, .04, GOLD, 'z', 16)
ellipsoid((0, 0, -.89), (.06, .06, .085), MINT, 10, 5)
finish_model('holy-lance')

# SERAPHIC BARRIER — three complete miniature winged wards around a central heart.
for i in range(3):
    q = i * TAU / 3
    x, z = math.cos(q) * .51, math.sin(q) * .51
    crest((x, .95, z), (.46, .76), GOLD)
    for side in [-1, 1]:
        wing((x + side * .13, 1.07, z - .06), side, .32, WHITE, 2)
    ellipsoid((x, 1.41, z), (.08, .095, .08), PEARL, 8, 4)
ellipsoid((0, 1.02, 0), (.18, .24, .18), MINT, 8, 4)
finish_model('seraphic-barrier')

# CLEANSING RADIANCE — broad curved ivory veils, with mint undersides and gilded tips.
for i in range(8):
    q = i * TAU / 8
    x, z = math.cos(q), math.sin(q)
    petal((x * .2, .08, z * .2), (x * .89, .98, z * .89), .24, WHITE if i % 2 else MINT, (x * .19, -.2, z * .19), 9)
    crystal((x * .82, .84, z * .82), (x * .89, 1.15, z * .89), .055, GOLD, 5)
ellipsoid((0, .11, 0), (.28, .1, .28), PEARL, 14, 6)
finish_model('cleansing-radiance')

# LIGHT OF DAWN — solid rising sun, a scalloped cloud bank and seven broad sun rays.
semicircle = [(-.59, .48, 0)] + [(math.cos(math.pi - i / 16 * math.pi) * .59, .48 + math.sin(math.pi - i / 16 * math.pi) * .59, 0) for i in range(17)]
plate(semicircle, .13, GOLD)
plate([(x * .86, .48 + (y - .48) * .86, .09) for x, y, z in semicircle], .055, WHITE)
for i in range(7):
    q = .14 + i * (math.pi - .28) / 6
    petal((math.cos(q) * .63, .48 + math.sin(q) * .63, 0), (math.cos(q), .48 + math.sin(q), 0), .09, GOLD, (0, 0, .06), 5)
for i in range(5):
    ellipsoid(((i - 2) * .26, .41 + (i % 2) * .06, .04), (.26, .16, .2), PEARL if i % 2 else PALE, 10, 5)
finish_model('light-of-dawn')

# WRATH OF HEAVEN — greatsword with a broad ivory blade, carved guard and twin banners.
plate([(-.18, -.1, 0), (-.2, .73, 0), (0, 1.05, 0), (.2, .73, 0), (.18, -.1, 0)], .13, GOLD)
plate([(-.105, -.02, .09), (-.115, .7, .09), (0, .96, .09), (.115, .7, .09), (.105, -.02, .09)], .045, WHITE)
tube([(0, -.69, 0), (0, -.1, 0)], [.065, .072], BRONZE, 10)
for side in [-1, 1]:
    petal((0, -.11, 0), (side * .53, .09, 0), .125, GOLD, (0, -.13, .03))
    petal((side * .36, -.11, -.03), (side * .49, -.74, -.02), .11, PEARL, (side * .1, .02, 0), 8)
ellipsoid((0, -.72, 0), (.11, .13, .11), PEARL, 12, 6)
ellipsoid((0, -.11, .11), (.09, .1, .045), MINT, 10, 5)
for i in range(4):
    ring((0, -.25 - i * .105, 0), .072, .018, GOLD, 'y', 12)
finish_model('wrath-of-heaven', y_forward=True)

# GUARDIAN OF THE DAWN — complete angel sculpture, layered wings, robe, staff and halo.
lathe((0, .11, 0), [(.4, 0), (.38, .1), (.27, .55), (.18, .96), (.26, 1.16), (.14, 1.3)], PEARL, 18)
for side in [-1, 1]:
    petal((side * .14, 1.14, .16), (side * .31, .13, .24), .10, GOLD, (0, .06, .06), 8)
    tube([(side * .19, 1.34, 0), (side * .34, 1.12, .13), (side * .42, .99, .25)], [.10, .078, .055], PEARL, 8)
    wing((side * .14, 1.31, -.1), side, .88, WHITE, 6)
ellipsoid((0, 1.71, 0), (.19, .24, .17), WHITE, 14, 8)
petal((-.18, 1.82, -.04), (.18, 1.82, -.04), .1, GOLD, (0, .11, -.02))
ring((0, 2.08, 0), .25, .045, GOLD, 'y', 20)
tube([(.6, .1, .22), (.6, 1.96, .22)], [.035, .04], GOLD, 8)
ellipsoid((.6, 2.05, .22), (.12, .14, .12), MINT, 8, 4)
cross((.6, 2.15, .24), .3, WHITE)
finish_model('guardian-of-the-dawn')

expected = {'smite', 'heal', 'holy-nova', 'flash-heal', 'power-word-shield', 'renew', 'searing-light',
            'binding-light', 'prayer-of-healing', 'holy-fire', 'penance', 'holy-word-serenity', 'divine-aegis',
            'chains-of-light', 'circle-of-healing', 'divine-hymn', 'radiant-burst', 'guardian-light',
            'greater-heal', 'sacred-flame', 'prayer-of-mending', 'holy-word-chastise', 'sanctuary', 'judgment',
            'salvation', 'holy-lance', 'seraphic-barrier', 'cleansing-radiance', 'light-of-dawn',
            'wrath-of-heaven', 'guardian-of-the-dawn'}
assert set(counts) == expected and len(m.objects) == 31
assert all(500 <= triangles <= 2200 for triangles in counts.values()), counts
bpy.context.preferences.filepaths.save_version = 0
export('cleric')
print(json.dumps({'triangles_per_model': counts}, indent=2))
