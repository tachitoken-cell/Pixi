# Adventurer v2: a clean, fully rigged rebuild of the Adventurer.
# The face and hair come from the scanned concept model (adventurer_rigged.blend, see README); the body and outfit
# (shirt, laced vest, belt, shorts, gloves, fur-cuffed boots) are rebuilt as smooth, separate parts so they bend
# cleanly at real joints: hips, knees, ankles, shoulders, elbows and wrists. Weights are computed from the part
# geometry, so nothing smears between the legs when walking.
#
# Run with Blender's Python (bpy 4.x):  python build_v2.py <scan.blend> <out.glb> [preview_dir]
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix

SCAN, OUT = sys.argv[-2], sys.argv[-1]
if len(sys.argv) > 3 and not sys.argv[-3].endswith('.py'):
    SCAN, OUT, PREVIEW = sys.argv[-3], sys.argv[-2], sys.argv[-1]
else:
    PREVIEW = None

bpy.ops.wm.open_mainfile(filepath=SCAN)
scan = bpy.data.objects['CHR_Adventurer']
for o in list(bpy.data.objects):
    if o is not scan: bpy.data.objects.remove(o, do_unlink=True)
scan.parent = None
scan.modifiers.clear()
for g in list(scan.vertex_groups): scan.vertex_groups.remove(g)

# ------------------------------------------------------------------ head from the scan (face + hair)
NECK_CUT = 1.036
bm = bmesh.new(); bm.from_mesh(scan.data)
kill = [f for f in bm.faces if min((v.co.z for v in f.verts)) < NECK_CUT]
bmesh.ops.delete(bm, geom=kill, context='FACES')
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context='VERTS')
bm.to_mesh(scan.data); bm.free()
head = scan; head.name = 'Head'
scan.data.transform(Matrix.Translation((0, 0, -0.018)))   # a slightly shorter neck

# ------------------------------------------------------------------ skeleton (names match the game's pivots)
L = 1
J = {}
def mirror(p): return Vector((-p[0], p[1], p[2]))
J['hip'] = Vector((0.072, 0.0, 0.555)); J['knee'] = Vector((0.074, -0.004, 0.33)); J['ankle'] = Vector((0.076, 0.0, 0.092))
J['toe'] = Vector((0.076, -0.105, 0.03))
J['sh'] = Vector((0.152, 0.004, 0.915)); J['elb'] = Vector((0.205, 0.01, 0.782)); J['wri'] = Vector((0.248, 0.0, 0.66))
J['palm'] = Vector((0.262, -0.008, 0.605))
BONES = {
    'Body': ((0, 0, 0.56), (0, 0, 0.64), None),
    'Torso': ((0, 0, 0.64), (0, 0, 0.97), 'Body'),
    'Neck': ((0, 0, 0.99), (0, 0, 1.35), 'Torso'),
}
for s, n in ((1, 'L'), (-1, 'R')):
    m = (lambda p: p) if s > 0 else mirror
    BONES['Arm' + n] = (m(J['sh']), m(J['elb']), 'Torso')
    BONES['ForeArm' + n] = (m(J['elb']), m(J['wri']), 'Arm' + n)
    BONES['Hand' + n] = (m(J['wri']), m(J['palm']), 'ForeArm' + n)
    BONES['Leg' + n] = (m(J['hip']), m(J['knee']), 'Body')
    BONES['Shin' + n] = (m(J['knee']), m(J['ankle']), 'Leg' + n)
    BONES['Foot' + n] = (m(J['ankle']), m(J['toe']), 'Shin' + n)

# ------------------------------------------------------------------ materials
MATS = {}
def mat(name, hexcol, rough=0.8):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new('M_' + name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    c = [((hexcol >> 16) & 255) / 255, ((hexcol >> 8) & 255) / 255, (hexcol & 255) / 255]
    c = [x ** 2.2 for x in c] + [1]
    b.inputs['Base Color'].default_value = c
    b.inputs['Roughness'].default_value = rough
    MATS[name] = m
    return m
COL = dict(shirt=0xece2cc, vest=0x5e3b25, vestdark=0x3f2717, lace=0xe0cfa8, belt=0x4a2d1b, gold=0xe0b24a,
           shorts=0x252a3c, skin=0xf5d0b4, glove=0x6e432a, boot=0x74482b, cuff=0xf1e7d2, sole=0x3b2b21, strap=0x4e3020)

# ------------------------------------------------------------------ hair repaint
# the scan only saw the head from the front and back: behind the cheeks it is a smear of skin and hair
# colours. Those faces get a plain hair material in the average colour of the scanned hair.
img = next(n.image for n in scan.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE')
px = img.pixels[:]; IW, IH = img.size
uvl = scan.data.uv_layers.active.data
def tex(uv):
    x = min(IW - 1, int(uv[0] % 1 * IW)); y = min(IH - 1, int(uv[1] % 1 * IH)); i = (y * IW + x) * 4
    return px[i:i + 3]
acc, cnt = [0, 0, 0], 0
for poly in scan.data.polygons:
    if poly.center.z > 1.33:
        c = tex(sum((uvl[li].uv for li in poly.loop_indices), Vector((0, 0))) / poly.loop_total)
        for k in range(3): acc[k] += c[k]
        cnt += 1
hair_srgb = [a / cnt for a in acc]
hair_lin = [0.62 * x ** 2.2 for x in hair_srgb]       # image pixels are sRGB, the shader wants linear; darker like the shaded strands
hair_m = bpy.data.materials.new('M_hair'); hair_m.use_nodes = True
hb = hair_m.node_tree.nodes['Principled BSDF']
hb.inputs['Base Color'].default_value = hair_lin + [1]; hb.inputs['Roughness'].default_value = 0.8
scan.data.materials.append(hair_m)
side = 0
for poly in scan.data.polygons:
    c = poly.center
    col = tex(sum((uvl[li].uv for li in poly.loop_indices), Vector((0, 0))) / poly.loop_total)
    light = sum(col) / 3 > sum(hair_srgb) / 3 * 1.25          # skin-coloured smear
    if (c.y > 0.0 and c.z < 1.242) or (c.y > -0.075 and 1.072 < c.z < 1.222 and light and abs(c.x) > 0.1):
        poly.material_index = 1; side += 1
print('hair colour (linear)', [round(x, 3) for x in hair_lin], 'repainted faces', side)

# ------------------------------------------------------------------ geometry helpers
PARTS = []    # (verts, faces, material name, weight function)
def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

def catmull(pts, n):
    """resample a list of tuples with Catmull-Rom so lofts are smooth"""
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pts[max(0, i - 1)], pts[i], pts[i + 1], pts[min(len(pts) - 1, i + 2)]
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)
                             for a, b, c, d in zip(p0, p1, p2, p3)))
    out.append(pts[-1])
    return out

def loft(rings, seg=20, cap0=True, cap1=True, skip=None, shape=None):
    """rings: list of (center Vector, axis Vector, rx, ry). Ring i is an ellipse perpendicular to axis.
    skip(angle) -> True leaves a gap (vest opening). shape(angle, i) -> radius multiplier."""
    V, F = [], []
    for i, (c, ax, rx, ry) in enumerate(rings):
        ax = ax.normalized()
        side = Vector((1, 0, 0)) if abs(ax.x) < 0.9 else Vector((0, 0, 1))
        u = (side - ax * side.dot(ax)).normalized(); v = ax.cross(u).normalized()
        for k in range(seg):
            a = 2 * math.pi * k / seg
            m = shape(a, i) if shape else 1
            V.append(c + u * (math.cos(a) * rx * m) + v * (math.sin(a) * ry * m))
    n = len(rings)
    for i in range(n - 1):
        for k in range(seg):
            a = 2 * math.pi * (k + 0.5) / seg
            if skip and skip(a): continue
            k2 = (k + 1) % seg
            F.append((i * seg + k, i * seg + k2, (i + 1) * seg + k2, (i + 1) * seg + k))
    if cap0:
        V.append(rings[0][0].copy()); ci = len(V) - 1
        for k in range(seg): F.append((ci, (k + 1) % seg, k))
    if cap1:
        V.append(rings[-1][0].copy()); ci = len(V) - 1; b = (n - 1) * seg
        for k in range(seg): F.append((ci, b + k, b + (k + 1) % seg))
    return V, F

def vloft(profile, cx=0.0, cy=0.0, n=4, **kw):
    """vertical loft from (z, rx, ry[, dy]) rows"""
    rows = sorted(profile, key=lambda r: r[0])             # bottom to top keeps the faces pointing outward
    pts = catmull([tuple(r) + ((0.0,) if len(r) == 3 else ()) for r in rows], n)
    return loft([(Vector((cx, cy + p[3], p[0])), Vector((0, 0, 1)), p[1], p[2]) for p in pts], **kw)

def path_loft(points, radii, n=4, **kw):
    """loft along a polyline of Vectors with (rx, ry) per point"""
    rows = catmull([tuple(p) + tuple(r) for p, r in zip(points, radii)], n)
    rings = []
    for i, r in enumerate(rows):
        a = Vector(rows[max(0, i - 1)][:3]); b = Vector(rows[min(len(rows) - 1, i + 1)][:3])
        rings.append((Vector(r[:3]), b - a, r[3], r[4]))
    return loft(rings, **kw)

def ellipsoid(c, r, seg=16, rings=10):
    V, F = [], []
    for i in range(1, rings):
        t = math.pi * i / rings
        for k in range(seg):
            a = 2 * math.pi * k / seg
            V.append(Vector((c[0] + r[0] * math.sin(t) * math.cos(a), c[1] + r[1] * math.sin(t) * math.sin(a), c[2] + r[2] * math.cos(t))))
    for i in range(rings - 2):
        for k in range(seg):
            k2 = (k + 1) % seg
            F.append(((i + 1) * seg + k, (i + 1) * seg + k2, i * seg + k2, i * seg + k))   # outward
    V.append(Vector((c[0], c[1], c[2] + r[2]))); top = len(V) - 1
    V.append(Vector((c[0], c[1], c[2] - r[2]))); bot = len(V) - 1
    last = (rings - 2) * seg
    for k in range(seg):
        F.append((top, k, (k + 1) % seg)); F.append((bot, last + (k + 1) % seg, last + k))
    return V, F

def torus(c, R, r, seg=24, tseg=10, sy=1.0, tilt=0.0):
    V, F = [], []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        for j in range(tseg):
            b = 2 * math.pi * j / tseg
            x = (R + r * math.cos(b)) * math.cos(a); y = (R + r * math.cos(b)) * math.sin(a) * sy; z = r * math.sin(b)
            z += y * tilt
            V.append(Vector((c[0] + x, c[1] + y, c[2] + z)))
    for k in range(seg):
        for j in range(tseg):
            k2, j2 = (k + 1) % seg, (j + 1) % tseg
            F.append((k * tseg + j, k2 * tseg + j, k2 * tseg + j2, k * tseg + j2))
    return V, F

def rbox(c, size, bevel=0.3, seg=10):
    """rounded box via a superellipsoid-ish ellipsoid squashed toward a box"""
    V, F = ellipsoid(c, [s / 2 for s in size], seg, 8)
    out = []
    for v in V:
        d = v - Vector(c)
        q = Vector([math.copysign(min(1, abs(d[i]) / (size[i] / 2)) ** (1 - bevel) * size[i] / 2, d[i]) for i in range(3)])
        out.append(Vector(c) + q)
    return out, F

def add(geo, material, wfn):
    PARTS.append((geo[0], geo[1], material, wfn))

# ------------------------------------------------------------------ weight functions
def W(**k): return lambda p: k
def torso_w(p):
    s = smooth(0.61, 0.70, p.z); return {'Torso': s, 'Body': 1 - s}
def neck_w(p):
    s = smooth(0.975, 1.02, p.z); return {'Neck': s, 'Torso': 1 - s}
def seg_param(p, a, b):
    ab = b - a; return (p - a).dot(ab) / ab.length_squared
def arm_w(n, s):
    m = (lambda q: q) if s > 0 else mirror
    sh, el, wr = m(J['sh']), m(J['elb']), m(J['wri'])
    def f(p):
        u = seg_param(p, sh, el); v = seg_param(p, el, wr)
        up = smooth(-0.35, 0.05, u)                   # shoulder blends into the torso
        fore = smooth(0.82, 1.12, u) if v < 0.3 else 1.0
        hand = smooth(0.92, 1.05, v)
        w = {'Torso': 1 - up}
        w['Arm' + n] = up * (1 - fore)
        w['ForeArm' + n] = up * fore * (1 - hand)
        w['Hand' + n] = up * fore * hand
        return w
    return f
def leg_w(n, s, pelvis=False):
    m = (lambda q: q) if s > 0 else mirror
    kn, an = m(J['knee']), m(J['ankle'])
    def f(p):
        thigh = smooth(0.60, 0.50, p.z) if pelvis else 1.0
        shin = smooth(kn.z + 0.035, kn.z - 0.035, p.z)
        foot = smooth(an.z + 0.035, an.z - 0.02, p.z) * smooth(0.02, -0.03, p.y)
        return {'Body': 1 - thigh, 'Leg' + n: thigh * (1 - shin), 'Shin' + n: thigh * shin * (1 - foot), 'Foot' + n: thigh * shin * foot}
    return f

# ------------------------------------------------------------------ body parts
FRONT = lambda a: abs(a - 1.5 * math.pi) < 0.33        # angle of -y (the front) in ring space
# shirt: chest a little fuller than the waist, rounded shoulders
add(vloft([(0.62, 0.112, 0.088), (0.66, 0.119, 0.093), (0.72, 0.126, 0.099, -0.003), (0.80, 0.136, 0.104, -0.006),
           (0.87, 0.142, 0.103, -0.004), (0.925, 0.13, 0.094), (0.965, 0.095, 0.075), (0.99, 0.05, 0.045)], seg=24), 'shirt', torso_w)
# collar: two soft flaps at the front
for s in (1, -1):
    add(rbox((s * 0.028, -0.05, 0.955), (0.05, 0.02, 0.035), 0.5), 'shirt', torso_w)
# vest: open at the front, slightly bigger than the shirt
vest_rows = [(0.655, 0.130, 0.103), (0.72, 0.134, 0.106, -0.003), (0.80, 0.143, 0.111, -0.006), (0.87, 0.149, 0.110, -0.004), (0.915, 0.137, 0.1)]
add(vloft(vest_rows, seg=28, cap0=False, cap1=False, skip=lambda a: abs(a - 1.5 * math.pi) < 0.42), 'vest', torso_w)
# vest trim along the opening and lacing across it
for s in (1, -1):
    a = 1.5 * math.pi + s * 0.42
    pts = [Vector((math.cos(a) * r[1] * 1.01, math.sin(a) * r[2] * 1.01 + (r[3] if len(r) > 3 else 0), r[0])) for r in vest_rows]
    add(path_loft(pts, [(0.007, 0.007)] * len(pts), seg=8), 'vestdark', torso_w)
for z in (0.70, 0.75, 0.80, 0.85):
    for s in (1, -1):
        add(path_loft([Vector((-s * 0.052, -0.108 - 0.004 * (z > 0.77), z)), Vector((s * 0.052, -0.108 - 0.004 * (z > 0.77), z + 0.045))],
                      [(0.0045, 0.0045)] * 2, n=1, seg=6), 'lace', torso_w)
# back straps (the X on the back of the concept)
for s in (1, -1):
    add(path_loft([Vector((s * 0.11, 0.108, 0.9)), Vector((0, 0.116, 0.8)), Vector((-s * 0.1, 0.108, 0.7))], [(0.013, 0.004)] * 3, seg=8), 'vestdark', torso_w)
# neck
add(vloft([(0.95, 0.036, 0.034), (0.99, 0.033, 0.032), (1.04, 0.034, 0.034), (1.07, 0.03, 0.03)], seg=16), 'skin', neck_w)
# belt, buckle and pouches
add(vloft([(0.655, 0.130, 0.103), (0.675, 0.133, 0.106), (0.695, 0.133, 0.106), (0.715, 0.130, 0.103)], seg=28, cap0=False, cap1=False), 'belt', torso_w)
add(rbox((0, -0.108, 0.685), (0.05, 0.014, 0.04), 0.6), 'gold', torso_w)
add(rbox((0, -0.116, 0.685), (0.026, 0.01, 0.018), 0.6), 'belt', torso_w)
add(rbox((0.10, -0.075, 0.655), (0.05, 0.035, 0.055), 0.55), 'glove', torso_w)           # pouch front-left
add(rbox((-0.118, 0.03, 0.66), (0.035, 0.06, 0.06), 0.55), 'glove', torso_w)            # pouch right hip
add(rbox((0.10, -0.094, 0.678), (0.03, 0.01, 0.02), 0.6), 'gold', torso_w)
# shorts: pelvis and two short legs (the crotch sits between them, so the hips bend cleanly)
add(vloft([(0.715, 0.127, 0.1), (0.66, 0.132, 0.104), (0.60, 0.13, 0.102), (0.56, 0.118, 0.094)], seg=24), 'shorts', torso_w)  # waistband moves with the belt
for s, n in ((1, 'L'), (-1, 'R')):
    x = s * 0.071
    add(vloft([(0.61, 0.068, 0.08), (0.55, 0.072, 0.078), (0.47, 0.074, 0.075), (0.40, 0.076, 0.074), (0.375, 0.07, 0.068)],
              cx=x, seg=18), 'shorts', leg_w(n, s, pelvis=True))
    # cuff of the shorts
    add(torus((x, 0, 0.383), 0.07, 0.009, seg=18, tseg=6, sy=0.98), 'shorts', leg_w(n, s))
    # knee and shin
    add(vloft([(0.40, 0.037, 0.038), (0.33, 0.036, 0.038), (0.26, 0.034, 0.036)], cx=s * 0.074, seg=14), 'skin', leg_w(n, s))
    # boot shaft, fur cuff, foot, sole and strap
    add(vloft([(0.07, 0.056, 0.062), (0.14, 0.055, 0.058), (0.22, 0.056, 0.057), (0.285, 0.059, 0.06)], cx=s * 0.076, seg=18, cap0=False), 'boot', leg_w(n, s))
    add(torus((s * 0.076, 0.0, 0.29), 0.058, 0.021, seg=20, tseg=8, sy=1.04), 'cuff', leg_w(n, s))
    foot = [Vector((s * 0.076, 0.052, 0.07)), Vector((s * 0.077, 0.02, 0.066)), Vector((s * 0.078, -0.035, 0.056)), Vector((s * 0.078, -0.085, 0.045)), Vector((s * 0.078, -0.118, 0.036))]
    add(path_loft(foot, [(0.052, 0.05), (0.058, 0.056), (0.059, 0.048), (0.052, 0.038), (0.032, 0.026)], seg=18), 'boot', leg_w(n, s))
    add(rbox((s * 0.078, -0.032, 0.012), (0.118, 0.19, 0.026), 0.5), 'sole', leg_w(n, s))
    add(path_loft([Vector((s * 0.076 + s * 0.055, -0.02, 0.11)), Vector((s * 0.076, -0.066, 0.118)), Vector((s * 0.076 - s * 0.055, -0.02, 0.11))],
                  [(0.012, 0.004)] * 3, seg=8), 'strap', leg_w(n, s))
    add(rbox((s * 0.076 + s * 0.058, -0.018, 0.11), (0.012, 0.018, 0.018), 0.6), 'gold', leg_w(n, s))
# arms: puffy short sleeve, skin, fingerless glove with a cuff, fist
for s, n in ((1, 'L'), (-1, 'R')):
    m = (lambda q: q) if s > 0 else mirror
    sh, el, wr, pa = m(J['sh']), m(J['elb']), m(J['wri']), m(J['palm'])
    up = el - sh
    add(ellipsoid(sh + Vector((s * 0.005, 0, 0.005)), (0.056, 0.058, 0.054)), 'shirt', arm_w(n, s))
    add(path_loft([sh - up * 0.1, sh + up * 0.2, sh + up * 0.42, sh + up * 0.5], [(0.055, 0.056), (0.058, 0.058), (0.05, 0.05), (0.044, 0.044)], seg=16), 'shirt', arm_w(n, s))
    add(path_loft([sh + up * 0.3, el, el + (wr - el) * 0.5], [(0.031, 0.031), (0.029, 0.03), (0.028, 0.028)], seg=14), 'skin', arm_w(n, s))
    add(path_loft([el + (wr - el) * 0.3, el + (wr - el) * 0.62, wr, wr + (pa - wr) * 0.2], [(0.031, 0.031), (0.035, 0.035), (0.036, 0.035), (0.034, 0.033)], seg=14), 'glove', arm_w(n, s))
    add(ellipsoid(pa, (0.037, 0.034, 0.042)), 'glove', arm_w(n, s))
    add(ellipsoid(pa + Vector((0, -0.018, -0.012)), (0.03, 0.022, 0.03)), 'skin', arm_w(n, s))     # bare fingers
    add(ellipsoid(pa + Vector((-s * 0.028, -0.022, 0.012)), (0.012, 0.012, 0.018)), 'skin', arm_w(n, s))  # thumb

# ------------------------------------------------------------------ build the body mesh
me = bpy.data.meshes.new('Body')
body = bpy.data.objects.new('Body', me)
bpy.context.scene.collection.objects.link(body)
allV, allF, fmat, wfns, ranges = [], [], [], [], []
names = list(dict.fromkeys(p[2] for p in PARTS))
for V, F, mname, wfn in PARTS:
    base = len(allV)
    allV.extend(V); allF.extend([tuple(i + base for i in f) for f in F]); fmat.extend([names.index(mname)] * len(F))
    ranges.append((base, len(allV), wfn))
me.from_pydata([tuple(v) for v in allV], [], allF)
me.validate(); me.update()
for nme in names: me.materials.append(mat(nme, COL[nme]))
for p, mi in zip(me.polygons, fmat): p.material_index = mi; p.use_smooth = True
groups = {b: body.vertex_groups.new(name=b) for b in BONES}
for a, b, wfn in ranges:
    for i in range(a, b):
        w = wfn(Vector(allV[i]))
        tot = sum(max(0, x) for x in w.values()) or 1
        for bn, x in w.items():
            if x > 1e-3: groups[bn].add([i], x / tot, 'REPLACE')
# the scanned head follows the Neck bone
hg = head.vertex_groups.new(name='Neck'); hg.add(list(range(len(head.data.vertices))), 1.0, 'REPLACE')
for p in head.data.polygons: p.use_smooth = True

# ------------------------------------------------------------------ armature
arm = bpy.data.armatures.new('RIG_Adventurer'); rig = bpy.data.objects.new('RIG_Adventurer', arm)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for name, (h, t, par) in BONES.items():
    e = arm.edit_bones.new(name); e.head = h; e.tail = t
    if par: e.parent = arm.edit_bones[par]; e.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for ob in (body, head):
    ob.parent = rig
    md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = rig
# one mesh (fewer draw calls): join the head into the body
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True); head.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.name = 'CHR_Adventurer'
print('tris', sum(len(p.vertices) - 2 for p in body.data.polygons), 'materials', [m.name for m in body.data.materials])
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '.blend'))

# ------------------------------------------------------------------ optional preview renders (Cycles, CPU)
if PREVIEW:
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 12; sc.cycles.device = 'CPU'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.8, 0.82, 0.9, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.2
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
    sun.data.energy = 3; sun.rotation_euler = (0.8, 0.2, -0.6)
    sc.render.resolution_x = 360; sc.render.resolution_y = 540
    cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = 1.7
    co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
    def shot(name, ang, pose=None):
        for pb in rig.pose.bones: pb.rotation_mode = 'XYZ'; pb.rotation_euler = (0, 0, 0)
        for b, r in (pose or {}).items(): rig.pose.bones[b].rotation_euler = r
        a = math.radians(ang)
        co.location = (math.sin(a) * 5, -math.cos(a) * 5, 0.75); co.rotation_euler = (math.pi / 2, 0, a)
        sc.render.filepath = f'{PREVIEW}/{name}.png'; bpy.ops.render.render(write_still=True)
    shot('front', 0); shot('side', 90); shot('back', 180); shot('q', 35)
    # bone-local X bends: legs/shins/feet swing, elbows bend (bone Y runs along each bone)
    shot('walk', 90, {'LegL': (-0.5, 0, 0), 'ShinL': (0.3, 0, 0), 'LegR': (0.45, 0, 0), 'ShinR': (0.9, 0, 0), 'FootR': (-0.3, 0, 0),
                      'ArmL': (0.4, 0, 0), 'ForeArmL': (0.5, 0, 0), 'ArmR': (-0.4, 0, 0), 'ForeArmR': (0.5, 0, 0)})
    for pb in rig.pose.bones: pb.rotation_euler = (0, 0, 0)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_yup=True,
                          export_animations=False, export_skins=True, export_image_format='JPEG', export_jpeg_quality=90)
print('EXPORTED')
