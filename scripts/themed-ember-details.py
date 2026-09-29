"""Authored Emberfall surface/anatomy pass, run before height normalization.

All ornament is baked into existing rigid parts. Hands, weapons, pivots and
parent links remain owned by the shared morphology/grip authoring pass.
"""


def ember_use(name, label='body'):
    global active, current
    assert name in parts and label in parts[name], (name, label)
    active, current = name, label


def ember_clear_head(name):
    ember_use(name, 'head')
    for field in ('vertices', 'faces', 'colors', 'materials'):
        parts[name]['head'][field].clear()


def ember_grille(x, y, z, w, h, side=0, metal='copper', bars=4):
    """Soot recess, thick forge frame and separated bars, front/back or side."""
    if side:
        box('coal', x, y, z, .10, h, w)
        for dy in [-h / 2, h / 2]:
            box(metal, x + side * .035, y + dy, z, .12, .065, w + .08)
        for dz in [-w / 2, w / 2]:
            box(metal, x + side * .035, y, z + dz, .12, h, .065)
        for i in range(bars):
            zz = z - w * .36 + i * w * .72 / max(1, bars - 1)
            box('ember', x + side * .057, y, zz, .022, h * .66, .038)
            box('steel', x + side * .09, y, zz + .047, .055, h * .90, .058)
    else:
        face = 1 if z >= 0 else -1
        box('coal', x, y, z, w, h, .10)
        for dy in [-h / 2, h / 2]:
            box(metal, x, y + dy, z + face * .035, w + .08, .065, .12)
        for dx in [-w / 2, w / 2]:
            box(metal, x + dx, y, z + face * .035, .065, h, .12)
        for i in range(bars):
            xx = x - w * .36 + i * w * .72 / max(1, bars - 1)
            box('ember', xx, y, z + face * .057, .038, h * .66, .022)
            box('steel', xx + .047, y, z + face * .09, .058, h * .90, .055)


def ember_spine(tint, x, y, z, width=.18, height=.30, depth=.20, lean=0):
    """Three broad stepped blocks give a carved silhouette at play distance."""
    for i, fraction in enumerate([1.0, .72, .43]):
        box(tint, x, y + (i + .5) * height / 3, z + lean * i / 2,
            width * fraction, height / 3 + .025, depth * fraction)


def ember_side_plate(side, x, y, z, h, d, metal='iron', trim='copper'):
    box('coal', x, y, z, .10, h + .08, d + .08)
    box(trim, x + side * .04, y, z, .11, h, d)
    box(metal, x + side * .095, y + .015, z, .075, h * .77, d * .76)
    for yy in [-h * .31, h * .31]:
        for zz in [-d * .31, d * .31]:
            box('gold', x + side * .15, y + yy, z + zz, .04, .055, .055)


def ember_joint(side, y, metal='steel'):
    """Elbow socket on the upper-arm part, away from the hand/grip assembly."""
    box('coal', side * .72, y, .03, .34, .18, .34)
    box(metal, side * .72, y, .035, .37, .085, .38)
    box('copper', side * .925, y, .035, .075, .14, .14)
    box('coal', side * .972, y, .035, .02, .055, .055)


# SLAG CRAWLER — interlocking boiler segments, side vents, forged leg sockets.
for segment in range(6):
    ember_use('slag-crawler', 'segment-' + str(segment))
    zz = -.98 + segment * .35
    plate('basalt', 'copper', 0, .90, zz, .80, .13, .32, .06)
    box('steel', 0, .985, zz, .19, .045, .25)
    for side in [-1, 1]:
        ember_side_plate(side, side * .475, .62, zz, .23, .21, 'slag', 'iron')
        box('ember', side * .53, .64, zz, .045, .13, .055)
        stud('copper', side * .30, .988, zz, .038)
for leg in range(12):
    ember_use('slag-crawler', 'leg-' + str(leg))
    side = 1 if leg % 2 else -1
    zz = -.88 + (leg // 2) * .32
    box('iron', side * .53, .485, zz + .025, .22, .17, .16)
    box('steel', side * .80, .395, zz + .10, .18, .13, .18)
ember_use('slag-crawler', 'head')
plate('iron', 'steel', 0, .87, 1.00, .70, .12, .50, .07)
box('coal', 0, .57, 1.295, .37, .15, .08)
for xx in [-.12, 0, .12]:
    box('copper', xx, .57, 1.35, .046, .12, .045)
for side in [-1, 1]:
    box('steel', side * .20, .825, 1.31, .22, .065, .08, rz=-side * .10)


# FURNACE REVENANT — an enclosed stove body, exhaust collars and repair plates.
ember_use('furnace-revenant')
ember_grille(0, 1.61, -.37, .66, .62, metal='iron')
for side in [-1, 1]:
    ember_grille(side * .51, 1.53, .015, .38, .48, side, 'copper', 3)
    box('leather', side * .28, 1.20, -.33, .13, .28, .10)
plate('iron', 'copper', 0, 1.03, .34, .73, .27, .10, .06)
for side, label in [(-1, 'left-arm'), (1, 'right-arm')]:
    ember_use('furnace-revenant', label)
    for layer in range(3):
        plate('basalt', 'copper', side * (.66 + layer * .03), 2.075 - layer * .11,
              .04, .55 - layer * .04, .14, .58 - layer * .025, .055)
    ember_joint(side, 1.43)
ember_use('furnace-revenant', 'head')
for xx, top in [(-.23, 2.81), (.23, 2.97)]:
    for yy in [2.57, top - .075]:
        ring('copper', xx, yy, -.05, .145, .025, 8)
    box('coal', xx, top + .005, -.05, .17, .025, .17)
box('steel', 0, 2.52, .26, .66, .095, .17)
for side, label in [(-1, 'left-leg-shin'), (1, 'right-leg-shin')]:
    ember_use('furnace-revenant', label)
    plate('iron', 'copper', side * .26, .29, .245, .28, .31, .08, .045)
    for toe in [-1, 0, 1]:
        box('steel', side * .26 + toe * .105, .13, .468, .085, .085, .055)


# ANVIL WARDEN — six boss motifs: apron, forged beard, shoulder stacks,
# articulated greaves, broad back furnace and its paired feed pipes.
ember_use('anvil-warden')
ember_grille(0, 1.58, -.405, .68, .69, metal='gold', bars=5)
for side in [-1, 1]:
    ember_side_plate(side, side * .515, 1.53, .015, .61, .50, 'steel', 'gold')
    rod('iron', (side * .32, 1.16, -.45), (side * .32, 1.94, -.45), .075, n=8)
    for yy in [1.20, 1.48, 1.88]:
        ring('copper', side * .32, yy, -.45, .10, .027, 8)
    plate('iron', 'gold', side * .37, 1.04, .39, .29, .34, .13, .055)
for side, label in [(-1, 'left-arm'), (1, 'right-arm')]:
    ember_use('anvil-warden', label)
    for layer in range(3):
        plate('steel' if layer == 0 else 'iron', 'gold', side * (.67 + layer * .025),
              2.105 - layer * .125, .045, .72 - layer * .06, .16, .50, .07)
    ember_side_plate(side, side * 1.005, 1.94, .025, .30, .50, 'basalt', 'gold')
    ember_joint(side, 1.43, 'gold')
ember_use('anvil-warden', 'head')
box('coal', 0, 2.125, .34, .46, .14, .13)
for i, xx in enumerate([-.16, 0, .16]):
    plate('steel', 'gold', xx, 2.065 - (i % 2) * .05, .425, .115, .28, .10, .025)
box('steel', 0, 2.46, .37, .62, .085, .12)
for side in [-1, 1]:
    box('coal', side * .30, 2.32, .16, .11, .30, .26)
    stud('gold', side * .315, 2.33, .31, .055)
for side, label in [(-1, 'left-leg-shin'), (1, 'right-leg-shin')]:
    ember_use('anvil-warden', label)
    for layer in range(3):
        plate('steel', 'gold', side * .26, .39 - layer * .10, .247,
              .30 + layer * .018, .14, .095, .035)
    for toe in [-1, 0, 1]:
        plate('iron', 'gold', side * .26 + toe * .113, .15, .445, .095, .15, .14, .02)
ember_use('anvil-warden', 'tabard')
for side in [-1, 1]:
    box('leather', side * .16, .72, .40, .055, .48, .035)
    for yy in [.51, .72, .93]:
        stud('gold', side * .16, yy, .43, .028)
plate('iron', 'gold', 0, .57, .405, .23, .13, .04, .025)


# PYRELORD IGNIVAR — crown forgework, chest cage, volcanic pauldrons,
# heraldic cape, fluted greaves and dark back armour beneath the mantle.
ember_use('pyrelord-ignivar')
for side in [-1, 1]:
    for row in range(3):
        plate('coal', 'copper', side * .34, 1.36 + row * .22, .37,
              .29, .16, .17, .05)
    ember_side_plate(side, side * .53, 1.56, -.035, .61, .45, 'basalt', 'gold')
plate('iron', 'gold', 0, 1.065, .32, .84, .20, .12, .065)
box('ember', 0, 1.075, .408, .22, .11, .04)
for row in range(5):
    plate('basalt', 'copper', 0, 1.22 + row * .145, -.345, .58, .16, .09, .045)
for side, label in [(-1, 'left-arm'), (1, 'right-arm')]:
    ember_use('pyrelord-ignivar', label)
    for row in range(3):
        plate('basalt', 'gold', side * (.66 + row * .045), 2.08 - row * .12,
              .03, .66 - row * .07, .16, .61, .07)
    for zz in [-.18, .04, .24]:
        ember_spine('coal', side * .79, 2.10, zz, .20, .24, .17, -.08)
    ember_joint(side, 1.44, 'gold')
ember_use('pyrelord-ignivar', 'head')
for side in [-1, 1]:
    box('coal', side * .16, 2.495, .335, .28, .075, .12, rz=-side * .19)
    plate('gold', 'copper', side * .31, 2.29, .19, .16, .34, .20, .04)
for xx in [-.24, -.12, 0, .12, .24]:
    box('gold', xx, 2.21, .40, .055, .10, .06)
for side in [-1, 1]:
    ring('copper', side * .50, 2.735, -.08, .112, .028, 8)
ember_use('pyrelord-ignivar', 'cape')
for row in range(6):
    yy = 1.78 - row * .22
    zz = -.475 - row * .033
    box('blood', 0, yy, zz, .31, .24, .035)
    for side in [-1, 1]:
        box('leather', side * .28, yy, zz, .055, .245, .045)
# Broad, stepped flame heraldry on the visible back, not a repeated cross glyph.
for xx, base, height in [(-.19, .60, .40), (0, .54, .73), (.19, .60, .50)]:
    ember_spine('copper', xx, base, -.655, .16, height, .06)
for side, label in [(-1, 'left-leg-shin'), (1, 'right-leg-shin')]:
    ember_use('pyrelord-ignivar', label)
    plate('coal', 'gold', side * .26, .29, .25, .33, .32, .10, .045)
    for xx in [-.095, 0, .095]:
        box('copper', side * .26 + xx, .28, .314, .036, .24, .04)
    box('ember', side * .26, .135, .465, .21, .075, .035)


# EMBER IMP — short mischievous muzzle, ears, brow, kiln apron and wing scales.
ember_clear_head('ember-imp')
plate('slag', 'copper', 0, 2.285, .03, .59, .45, .48, .02)
box('coal', 0, 2.12, .285, .43, .12, .20)
plate('slag', 'copper', 0, 2.205, .36, .44, .17, .32, .02)
box('coal', 0, 2.26, .535, .14, .085, .045)
for side in [-1, 1]:
    eye(side * .175, 2.385, .305, .063, 'fire')
    box('coal', side * .175, 2.46, .32, .25, .075, .09, rz=-side * .17)
    box('ivory', side * .145, 2.115, .401, .065, .10, .055)
    plate('slag', 'copper', side * .405, 2.36, -.015, .33, .18, .17, .06)
    box('blood', side * .427, 2.36, .083, .19, .075, .025)
    ember_spine('coal', side * .27, 2.49, -.06, .21, .34, .20, -.08)
    ember_spine('copper', side * .29, 2.76, -.13, .10, .14, .09)
ember_use('ember-imp')
plate('coal', 'copper', 0, 1.56, .38, .46, .54, .12, .07)
for xx in [-.12, 0, .12]:
    box('ember', xx, 1.57, .458, .055, .30, .03)
plate('leather', 'copper', 0, 1.06, .31, .60, .29, .12, .045)
for side in [-1, 1]:
    ember_side_plate(side, side * .49, 1.56, .02, .35, .32, 'slag', 'coal')
for side, label in [(-1, 'left-wing'), (1, 'right-wing')]:
    ember_use('ember-imp', label)
    for i in range(3):
        plate('coal', 'copper', side * (.47 + i * .16), 1.935 - i * .04,
              -.21 - i * .12, .20, .11, .23, .04)
for side, label in [(-1, 'left-leg-shin'), (1, 'right-leg-shin')]:
    ember_use('ember-imp', label)
    plate('coal', 'copper', side * .26, .27, .235, .24, .23, .075, .04)


# CINDER HOUND — long canine muzzle, heavy brows, articulated mantle scutes.
ember_clear_head('cinder-hound')
plate('basalt', 'iron', 0, 1.145, .645, .60, .42, .50, .02)
plate('slag', 'basalt', 0, 1.04, 1.005, .39, .21, .60, .015)
box('coal', 0, 1.085, 1.323, .27, .115, .085)
box('coal', 0, .905, 1.015, .34, .055, .48)
plate('basalt', 'iron', 0, .865, .995, .36, .095, .46, .015)
for side in [-1, 1]:
    eye(side * .215, 1.205, .919, .061, 'hot')
    box('coal', side * .23, 1.286, .896, .25, .082, .13, rz=-side * .15)
    ember_spine('basalt', side * .24, 1.30, .51, .20, .30, .20, -.13)
    box('ember', side * .245, 1.445, .49, .067, .115, .065)
    for zz in [.92, 1.14]:
        box('ivory', side * .165, .91, zz, .049, .10, .057)
    ember_side_plate(side, side * .285, 1.035, .63, .23, .28, 'basalt', 'slag')
ember_use('cinder-hound')
for row in range(5):
    zz = -.64 + row * .29
    plate('basalt', 'slag', 0, 1.275, zz, .65, .10, .29, .055)
    for side in [-1, 1]:
        ember_side_plate(side, side * .40, .97, zz, .28, .29, 'basalt', 'coal')
        box('ember', side * .445, .96, zz + .09, .045, .12, .03)
for leg in range(4):
    ember_use('cinder-hound', 'leg-' + str(leg))
    side = -1 if leg % 2 == 0 else 1
    zz = (1 if leg < 2 else -1) * .59
    plate('basalt', 'copper', side * .38, .34, zz, .24, .27, .22, .045)
    for toe in [-1, 0, 1]:
        box('coal', side * .401 + toe * .072, .16, zz + .14, .052, .12, .14)


# FORGE SPIDER — layered boiler shell, access hatch, leg pistons and collar pins.
ember_use('forge-spider', 'abdomen')
for row in range(4):
    plate('copper', 'iron', 0, 1.045, -.83 + row * .20, .82, .15, .23, .075)
for side in [-1, 1]:
    ember_grille(side * .505, .755, -.56, .46, .28, side, 'gold', 3)
ember_grille(0, .73, -.985, .52, .30, metal='iron', bars=3)
ember_use('forge-spider')
plate('iron', 'steel', 0, .78, .015, .75, .09, .68, .06)
for side in [-1, 1]:
    box('copper', side * .315, .84, .01, .09, .07, .44)
    for zz in [-.12, .16]:
        stud('gold', side * .315, .886, zz, .038)
for leg in range(8):
    ember_use('forge-spider', 'leg-' + str(leg))
    side = -1 if leg % 2 == 0 else 1
    zz = .39 - (leg // 2) * .28
    knee = side * (.88 + .08 * (leg // 2))
    rod('iron', (side * .41, .65, zz + .07), (side * .73, .70, zz + .07), .078, n=6)
    rod('silver', (side * .56, .66, zz + .07), (knee, .70, zz + .07), .039, n=6)
    box('iron', knee, .70, zz, .21, .19, .23)
    box('copper', knee, .704, zz + .133, .105, .11, .045)
ember_use('forge-spider', 'head')
plate('steel', 'copper', 0, .86, .54, .73, .12, .38, .055)
box('coal', 0, .57, .76, .23, .14, .085)
for xx in [-.075, .075]:
    box('steel', xx, .57, .816, .055, .13, .05)


# BRASS SENTINEL — clockwork breastplate, heavy shoulder plates, flywheel teeth.
ember_use('brass-sentinel')
for side in [-1, 1]:
    plate('copper', 'gold', side * .355, 1.62, .33, .19, .65, .17, .04)
    ember_side_plate(side, side * .515, 1.54, 0, .58, .43, 'copper', 'iron')
plate('iron', 'gold', 0, 1.115, .35, .68, .19, .13, .05)
for side, label in [(-1, 'left-arm'), (1, 'right-arm')]:
    ember_use('brass-sentinel', label)
    for row in range(3):
        plate('copper', 'gold', side * (.67 + row * .025), 2.075 - row * .105,
              .015, .59 - row * .05, .135, .57, .055)
    ember_joint(side, 1.43, 'gold')
ember_use('brass-sentinel', 'flywheel')
for tooth in range(12):
    a = tooth * math.tau / 12
    box('iron', .49 * math.cos(a), 1.70 + .49 * math.sin(a), -.47,
        .14, .14, .19, rz=a)
plate('copper', 'gold', 0, 1.70, -.56, .27, .27, .10, .065)
ember_use('brass-sentinel', 'head')
box('copper', 0, 2.515, .405, .65, .09, .09)
for side in [-1, 1]:
    box('iron', side * .32, 2.33, .27, .13, .33, .24)
    stud('gold', side * .32, 2.31, .407, .045)


# SLAG ELEMENTAL — nested broken basalt slabs around a visible molten core.
ember_use('slag-elemental')
for row in range(3):
    for column in range(6):
        angle = column * math.tau / 6 + (row % 2) * .19
        xx, zz = .53 * math.cos(angle), .42 * math.sin(angle)
        box('coal', xx, .84 + row * .34, zz, .36, .32, .27, ry=angle, rz=.08)
        box('basalt', xx * 1.045, .885 + row * .34, zz * 1.045,
            .29, .21, .29, ry=angle, rz=.08)
        box('slag', xx * 1.11, .85 + row * .34, zz * 1.11,
            .19, .06, .20, ry=angle)
for side, label in [(-1, 'left-arm'), (1, 'right-arm')]:
    ember_use('slag-elemental', label)
    for row in range(3):
        plate('basalt', 'coal', side * (.63 + row * .09), 1.61 - row * .24,
              .03, .45, .20, .47, .08)
ember_use('slag-elemental', 'head')
for side in [-1, 1]:
    box('coal', side * .18, 2.26, .34, .29, .095, .12, rz=-side * .13)
    plate('basalt', 'slag', side * .27, 2.045, .21, .20, .26, .22, .055)
box('coal', 0, 1.925, .29, .40, .08, .18)
for xx in [-.13, 0, .13]:
    box('ember', xx, 1.936, .388, .065, .055, .028)


# ASH DRAKE — long reptilian snout, swept cheek horns and layered body scutes.
ember_clear_head('ash-drake')
plate('basalt', 'slag', 0, 1.445, .72, .55, .37, .55, .02)
plate('slag', 'basalt', 0, 1.365, 1.085, .39, .20, .69, .015)
box('coal', 0, 1.253, 1.10, .35, .052, .55)
plate('basalt', 'copper', 0, 1.198, 1.075, .35, .08, .54, .01)
for side in [-1, 1]:
    eye(side * .20, 1.51, .966, .052, 'fire')
    box('coal', side * .215, 1.585, .92, .25, .085, .15, rz=-side * .17)
    box('coal', side * .13, 1.443, 1.416, .065, .039, .065)
    ember_spine('basalt', side * .23, 1.60, .52, .18, .30, .23, -.17)
    for row in range(3):
        plate('slag', 'copper', side * (.25 + row * .025), 1.40 - row * .055,
              .54 - row * .11, .18, .10, .20, .035)
    for zz in [.95, 1.16, 1.33]:
        box('ivory', side * .145, 1.261, zz, .045, .075, .045)
ember_use('ash-drake')
for row in range(6):
    zz = -.71 + row * .25
    plate('basalt', 'copper', 0, 1.365, zz, .39, .095, .28, .05)
    for side in [-1, 1]:
        ember_side_plate(side, side * .36, 1.065, zz, .26, .25, 'slag', 'basalt')
for side, label in [(-1, 'left-wing'), (1, 'right-wing')]:
    ember_use('ash-drake', label)
    for row in range(4):
        plate('basalt', 'copper', side * (.43 + row * .26), 1.24 + row * .015,
              -.17 - row * .016, .32, .085, .17, .04)
        # Broad ash-colored membrane patches follow the authored wing triangles.
        polygon('slag', [(side * (.57 + row * .20), 1.205, -.28),
                         (side * (.78 + row * .18), 1.145, -.39 - row * .07),
                         (side * (.48 + row * .18), 1.15, -.47 - row * .04)], [(0, 1, 2)])
for segment in range(3):
    ember_use('ash-drake', 'tail-' + str(segment))
    xx, yy, zz = parts[active][current]['pivot']
    for row in range(2):
        plate('basalt', 'copper', xx, yy + .13, zz - row * .20,
              .23 - segment * .025, .065, .23, .035)


# FURNACE PRIEST — kiln vestments, folded collar, riveted flues and rear seals.
ember_use('furnace-priest')
for side in [-1, 1]:
    plate('copper', 'gold', side * .315, 1.795, .25, .24, .35, .22, .045)
    ember_side_plate(side, side * .48, 1.45, .02, .49, .37, 'coal', 'copper')
    for yy in [1.54, 1.89, 2.23]:
        ring('iron', side * .33, yy, -.37, .171, .031, 8)
for side, label in [(-1, 'left-arm'), (1, 'right-arm')]:
    ember_use('furnace-priest', label)
    plate('coal', 'copper', side * .67, 2.035, .01, .54, .23, .57, .06)
    ember_grille(side * .67, 1.915, .32, .33, .25, metal='gold', bars=3)
ember_use('furnace-priest', 'head')
for side in [-1, 1]:
    ember_side_plate(side, side * .35, 2.485, -.025, .25, .40, 'coal', 'gold')
box('copper', 0, 2.40, .383, .51, .07, .08)
ember_use('furnace-priest', 'cape')
for side in [-1, 1]:
    for row in range(6):
        box('blood', side * .275, 1.76 - row * .23, -.428, .16, .25, .035)
        box('copper', side * .405, 1.76 - row * .23, -.435, .045, .25, .04)
plate('coal', 'copper', 0, 1.57, -.47, .38, .38, .09, .075)
ember_grille(0, 1.57, -.54, .23, .20, metal='gold', bars=3)


# CHAIN JAILER — cage ribs, padlocked back plate and thick hinge shoulders.
ember_use('chain-jailer')
for side in [-1, 1]:
    ember_side_plate(side, side * .525, 1.56, .00, .62, .46, 'iron', 'copper')
    plate('iron', 'copper', side * .365, 1.59, .34, .22, .64, .14, .04)
ember_grille(0, 1.59, -.385, .59, .58, metal='iron', bars=4)
plate('iron', 'copper', 0, 1.13, -.395, .52, .22, .12, .045)
plate('copper', 'iron', 0, 1.235, -.49, .19, .24, .09, .04)
box('coal', 0, 1.235, -.551, .044, .10, .019)
for side, label in [(-1, 'left-arm'), (1, 'right-arm')]:
    ember_use('chain-jailer', label)
    for row in range(3):
        plate('iron', 'copper', side * (.68 + row * .035), 2.09 - row * .105,
              .01, .64 - row * .05, .14, .54, .06)
    ember_joint(side, 1.45, 'iron')
ember_use('chain-jailer', 'head')
box('coal', 0, 2.60, .14, .72, .10, .66)
for side in [-1, 1]:
    ember_side_plate(side, side * .35, 2.36, .05, .37, .41, 'iron', 'copper')
    box('iron', side * .16, 2.515, .435, .26, .09, .09, rz=-side * .12)
for side, label in [(-1, 'left-leg-shin'), (1, 'right-leg-shin')]:
    ember_use('chain-jailer', label)
    plate('iron', 'copper', side * .26, .28, .235, .29, .29, .09, .045)
    for xx in [-.08, .08]:
        box('steel', side * .26 + xx, .28, .295, .052, .23, .035)
