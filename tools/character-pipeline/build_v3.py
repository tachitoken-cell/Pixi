# Adventurer v3: the v2 rig (clean parts, real joints) fitted to the second concept sheet (model.glb).
# The face and hair come from the carved sheet (fuse1/fuse2/bake on the new sheet); the body parts follow the
# sheet's front silhouette and are painted by projecting the sheet's front and back figures onto them, with the
# outfit's plain colours on the sides that the sheet never shows. Everything ends up in one texture.
#
# Run with Blender's Python (bpy 4.x):  python build_v3.py <textured carve .blend> <fuse1 .blend> <out.glb> [preview_dir]
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix

args = [a for a in sys.argv if not a.endswith('.py')][-4:]
if args[-1].endswith('.glb'): SCAN, FIGS, OUT, PREVIEW = args[-3], args[-2], args[-1], None
else: SCAN, FIGS, OUT, PREVIEW = args

bpy.ops.wm.open_mainfile(filepath=SCAN)
scan = bpy.data.objects['CHR_Adventurer']
for o in list(bpy.data.objects):
    if o is not scan: bpy.data.objects.remove(o, do_unlink=True)
scan.parent = None
scan.modifiers.clear()
for g in list(scan.vertex_groups): scan.vertex_groups.remove(g)

# ------------------------------------------------------------------ head from the scan (face + hair)
NECK_CUT = 1.045
HEAD_DX = -0.015                                          # the sheet's head sits a little off-centre
bm = bmesh.new(); bm.from_mesh(scan.data)
kill = [f for f in bm.faces if min((v.co.z for v in f.verts)) < NECK_CUT]
bmesh.ops.delete(bm, geom=kill, context='FACES')
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context='VERTS')
bm.to_mesh(scan.data); bm.free()
head = scan; head.name = 'Head'
scan.data.transform(Matrix.Translation((HEAD_DX, 0, -0.03)))       # and a shorter neck

# ------------------------------------------------------------------ skeleton (names match the game's pivots)
L = 1
J = {}
def mirror(p): return Vector((-p[0], p[1], p[2]))
# proportions measured on the sheet's front figure: wide stance, big boots, arms well away from the body
J['hip'] = Vector((0.1, 0.0, 0.52)); J['knee'] = Vector((0.105, -0.004, 0.33)); J['ankle'] = Vector((0.11, 0.0, 0.1))
J['toe'] = Vector((0.11, -0.12, 0.03))
J['sh'] = Vector((0.165, 0.004, 0.86)); J['elb'] = Vector((0.232, 0.01, 0.715)); J['wri'] = Vector((0.27, 0.0, 0.6))
J['palm'] = Vector((0.283, -0.008, 0.535))
BONES = {
    'Body': ((0, 0, 0.52), (0, 0, 0.6), None),
    'Torso': ((0, 0, 0.6), (0, 0, 0.95), 'Body'),
    'Neck': ((0, 0, 0.98), (0, 0, 1.4), 'Torso'),
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
COL = dict(shirt=0xeee4d2, vest=0x5a3620, vestdark=0x3a2214, lace=0x3a2214, belt=0x3e2616, gold=0xd8a848,
           shorts=0x26262e, skin=0xf6d2b8, glove=0x6a3e24, boot=0x6e4228, cuff=0x5e3820, sole=0xb8aa98, strap=0x3e2616)

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
    if poly.center.z > 1.35:
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
    if (c.y > 0.03 and c.z < 1.29) or (c.y > -0.09 and 1.03 < c.z < 1.29 and light and abs(c.x) > 0.1):
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
    s = smooth(0.57, 0.66, p.z); return {'Torso': s, 'Body': 1 - s}
def neck_w(p):
    s = smooth(0.97, 1.01, p.z); return {'Neck': s, 'Torso': 1 - s}
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
        thigh = smooth(0.57, 0.47, p.z) if pelvis else 1.0
        shin = smooth(kn.z + 0.035, kn.z - 0.035, p.z)
        foot = smooth(an.z + 0.035, an.z - 0.02, p.z) * smooth(0.02, -0.03, p.y)
        return {'Body': 1 - thigh, 'Leg' + n: thigh * (1 - shin), 'Shin' + n: thigh * shin * (1 - foot), 'Foot' + n: thigh * shin * foot}
    return f

# ------------------------------------------------------------------ body parts (fitted to the sheet)
# shirt: the sheet's torso is about 0.23 wide at the chest and 0.3 at the belt with the pouches
add(vloft([(0.58, 0.112, 0.088), (0.63, 0.118, 0.092), (0.70, 0.12, 0.095), (0.77, 0.128, 0.1, -0.004),
           (0.84, 0.136, 0.1, -0.004), (0.9, 0.126, 0.092), (0.945, 0.095, 0.075), (0.975, 0.05, 0.045)], seg=24), 'shirt', torso_w)
for s_ in (1, -1):
    add(rbox((s_ * 0.028, -0.05, 0.94), (0.05, 0.02, 0.035), 0.5), 'shirt', torso_w)
vest_rows = [(0.645, 0.127, 0.1), (0.7, 0.128, 0.102, -0.003), (0.77, 0.135, 0.107, -0.005), (0.84, 0.143, 0.107, -0.004), (0.895, 0.132, 0.098)]
add(vloft(vest_rows, seg=28, cap0=False, cap1=False, skip=lambda a: abs(a - 1.5 * math.pi) < 0.42), 'vest', torso_w)
for s_ in (1, -1):
    a_ = 1.5 * math.pi + s_ * 0.42
    pts = [Vector((math.cos(a_) * r[1] * 1.01, math.sin(a_) * r[2] * 1.01 + (r[3] if len(r) > 3 else 0), r[0])) for r in vest_rows]
    add(path_loft(pts, [(0.007, 0.007)] * len(pts), seg=8), 'vestdark', torso_w)
for z in (0.69, 0.74, 0.79, 0.84):
    for s_ in (1, -1):
        add(path_loft([Vector((-s_ * 0.05, -0.105, z)), Vector((s_ * 0.05, -0.105, z + 0.042))], [(0.0045, 0.0045)] * 2, n=1, seg=6), 'lace', torso_w)
for s_ in (1, -1):
    add(path_loft([Vector((s_ * 0.105, 0.105, 0.88)), Vector((0, 0.112, 0.77)), Vector((-s_ * 0.1, 0.105, 0.68))], [(0.014, 0.004)] * 3, seg=8), 'vestdark', torso_w)
add(vloft([(0.93, 0.037, 0.035), (0.98, 0.034, 0.033), (1.03, 0.036, 0.036), (1.06, 0.032, 0.032)], seg=16), 'skin', neck_w)
# belt with buckle and two big pouches (the sheet's belt sits at the hips)
add(vloft([(0.595, 0.134, 0.106), (0.615, 0.137, 0.109), (0.64, 0.137, 0.109), (0.66, 0.134, 0.106)], seg=28, cap0=False, cap1=False), 'belt', torso_w)
add(rbox((0, -0.112, 0.628), (0.058, 0.014, 0.046), 0.6), 'gold', torso_w)
add(rbox((0, -0.12, 0.628), (0.03, 0.01, 0.022), 0.6), 'belt', torso_w)
for s_ in (1, -1):
    add(rbox((s_ * 0.132, -0.045, 0.595), (0.05, 0.05, 0.075), 0.55), 'glove', torso_w)
    add(rbox((s_ * 0.132, -0.071, 0.61), (0.02, 0.008, 0.016), 0.6), 'gold', torso_w)
# shorts: pelvis and two legs (wide stance)
add(vloft([(0.665, 0.13, 0.103), (0.6, 0.138, 0.106), (0.54, 0.14, 0.104), (0.5, 0.13, 0.096)], seg=24), 'shorts', torso_w)
for s_, n in ((1, 'L'), (-1, 'R')):
    x = s_ * 0.1
    add(vloft([(0.58, 0.07, 0.08), (0.52, 0.08, 0.082), (0.45, 0.084, 0.082), (0.39, 0.086, 0.082), (0.36, 0.08, 0.076)],
              cx=x, seg=18), 'shorts', leg_w(n, s_, pelvis=True))
    add(torus((x, 0, 0.368), 0.082, 0.011, seg=18, tseg=6, sy=0.97), 'shorts', leg_w(n, s_))       # rolled-up hem
    add(vloft([(0.38, 0.04, 0.042), (0.33, 0.039, 0.041), (0.27, 0.037, 0.04)], cx=s_ * 0.105, seg=14), 'skin', leg_w(n, s_))
    # boots: tall shaft, folded leather cuff, big rounded toe, light sole, buckle strap
    bx = s_ * 0.11
    add(vloft([(0.07, 0.066, 0.07), (0.15, 0.064, 0.066), (0.24, 0.065, 0.066), (0.3, 0.068, 0.068)], cx=bx, seg=18, cap0=False), 'boot', leg_w(n, s_))
    add(vloft([(0.25, 0.074, 0.074), (0.3, 0.078, 0.078), (0.325, 0.074, 0.074)], cx=bx, seg=18, cap0=False, cap1=False), 'cuff', leg_w(n, s_))
    foot = [Vector((bx, 0.06, 0.075)), Vector((bx, 0.02, 0.072)), Vector((bx, -0.04, 0.062)), Vector((bx, -0.095, 0.05)), Vector((bx, -0.135, 0.04))]
    add(path_loft(foot, [(0.062, 0.058), (0.068, 0.064), (0.07, 0.056), (0.062, 0.045), (0.038, 0.03)], seg=18), 'boot', leg_w(n, s_))
    add(rbox((bx, -0.035, 0.014), (0.14, 0.215, 0.03), 0.5), 'sole', leg_w(n, s_))
    add(path_loft([Vector((bx + s_ * 0.066, -0.01, 0.17)), Vector((bx, -0.07, 0.175)), Vector((bx - s_ * 0.066, -0.01, 0.17))], [(0.016, 0.005)] * 3, seg=8), 'strap', leg_w(n, s_))
    add(rbox((bx, -0.07, 0.175), (0.024, 0.01, 0.022), 0.6), 'gold', leg_w(n, s_))
# arms: short puffy sleeve, skin, big fingerless glove with a cuff, fist
for s_, n in ((1, 'L'), (-1, 'R')):
    m = (lambda q: q) if s_ > 0 else mirror
    sh, el, wr, pa = m(J['sh']), m(J['elb']), m(J['wri']), m(J['palm'])
    up = el - sh
    add(ellipsoid(sh + Vector((s_ * 0.005, 0, 0.005)), (0.058, 0.06, 0.056)), 'shirt', arm_w(n, s_))
    add(path_loft([sh - up * 0.1, sh + up * 0.2, sh + up * 0.42, sh + up * 0.5], [(0.057, 0.058), (0.06, 0.06), (0.052, 0.052), (0.046, 0.046)], seg=16), 'shirt', arm_w(n, s_))
    add(path_loft([sh + up * 0.3, el, el + (wr - el) * 0.5], [(0.033, 0.033), (0.031, 0.032), (0.03, 0.03)], seg=14), 'skin', arm_w(n, s_))
    add(path_loft([el + (wr - el) * 0.25, el + (wr - el) * 0.6, wr, wr + (pa - wr) * 0.2], [(0.036, 0.036), (0.042, 0.042), (0.043, 0.042), (0.04, 0.039)], seg=14), 'glove', arm_w(n, s_))
    add(ellipsoid(pa, (0.042, 0.038, 0.047)), 'glove', arm_w(n, s_))
    add(ellipsoid(pa + Vector((0, -0.02, -0.014)), (0.034, 0.025, 0.033)), 'skin', arm_w(n, s_))
    add(ellipsoid(pa + Vector((-s_ * 0.032, -0.024, 0.012)), (0.013, 0.013, 0.02)), 'skin', arm_w(n, s_))

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

# ------------------------------------------------------------------ one texture for everything
# head texels keep the carved head's colours; body texels mix the sheet's front / back figures (where the surface
# faces them) with the outfit's plain colours (on the sides, which the sheet never shows)
import numpy as np
from scipy.ndimage import distance_transform_edt
ob = body
me = ob.data
headuv = me.uv_layers[0]; headuv.name = 'HeadUV'
for m_ in me.materials:
    if m_.name.startswith('M_Adventurer'):
        nt_ = m_.node_tree
        tx_ = next(n for n in nt_.nodes if n.type == 'TEX_IMAGE')
        uvn = nt_.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'HeadUV'
        nt_.links.new(uvn.outputs['UV'], tx_.inputs['Vector'])
atlas = me.uv_layers.new(name='Atlas'); me.uv_layers.active = atlas
for o in bpy.context.selected_objects: o.select_set(False)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')
N = 2048
img = bpy.data.images.new('T_Adventurer_Color', N, N)
for m_ in me.materials:
    t_ = m_.node_tree.nodes.new('ShaderNodeTexImage'); t_.image = img; m_.node_tree.nodes.active = t_
with bpy.data.libraries.load(FIGS) as (src, dst):
    dst.objects = [n for n in src.objects if n in ('SRC_Front', 'SRC_Back')]
figs = {o.name: o for o in dst.objects}
def keep_facing(o, axis, sign, thresh=0.25):
    b_ = bmesh.new(); b_.from_mesh(o.data); b_.normal_update()
    bmesh.ops.delete(b_, geom=[f for f in b_.faces if f.normal[axis] * sign < -thresh], context='FACES'); b_.to_mesh(o.data); b_.free()
for nme_, o in figs.items():
    bpy.context.scene.collection.objects.link(o)
    o.data.transform(Matrix.Translation((-0.01, 0, 0)))
    keep_facing(o, 1, -1 if nme_ == 'SRC_Front' else 1)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 4
bk = sc.render.bake; bk.margin = 0
bk.use_pass_direct = False; bk.use_pass_indirect = False; bk.use_pass_color = True
def px():
    return np.array(img.pixels[:], np.float32).reshape(N, N, 4)
def bake_from(sources, kind='DIFFUSE', cage=0.03, ray=0.16):
    bk.cage_extrusion = cage; bk.max_ray_distance = ray
    img.pixels.foreach_set(np.zeros(N * N * 4, np.float32))
    for o in bpy.data.objects: o.select_set(False)
    for o in sources: o.select_set(True)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bk.use_selected_to_active = bool(sources)
    if kind == 'NORMAL': bk.normal_space = 'OBJECT'
    bpy.ops.object.bake(type=kind)
    return px()
flat = bake_from([])
front = bake_from([figs['SRC_Front']])
back = bake_from([figs['SRC_Back']])
nrm = bake_from([], 'NORMAL')
# head mask: head materials glow white in an emission bake
for m_ in me.materials:
    p_ = m_.node_tree.nodes['Principled BSDF']
    head_mat = m_.name.startswith('M_Adventurer') or m_.name.startswith('M_hair')
    p_.inputs['Emission Color'].default_value = (1, 1, 1, 1) if head_mat else (0, 0, 0, 1)
    p_.inputs['Emission Strength'].default_value = 1.0
sc.view_settings.view_transform = 'Standard'
headm = bake_from([], 'EMIT')[..., 0] > 0.5
for m_ in me.materials: m_.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.0
n = nrm[..., :3] * 2 - 1
covered = nrm[..., 3] > 0
hitF = front[..., :3].sum(-1) > 0.015; hitB = back[..., :3].sum(-1) > 0.015
wF = np.clip(-n[..., 1], 0, 1) ** 2 * 2.2 * hitF
wB = np.clip(n[..., 1], 0, 1) ** 2 * 2.2 * hitB
wN = 0.2 + np.clip(1 - np.abs(n[..., 1]), 0, 1) ** 2 * 2.0
# only take the sheet's colour where it looks like this part's own material (shading and small details yes,
# a neighbouring part's colour no: that is where the parts and the drawing don't line up exactly)
def agree(proj):
    d = np.linalg.norm(proj[..., :3] - flat[..., :3], axis=-1) / (0.06 + 0.5 * (proj[..., :3].sum(-1) + flat[..., :3].sum(-1)) / 3)
    return np.exp(-(d / 0.55) ** 2)
wF = wF * agree(front); wB = wB * agree(back)
col = (front[..., :3] * wF[..., None] + back[..., :3] * wB[..., None] + flat[..., :3] * wN[..., None]) / (wF + wB + wN)[..., None]
col = np.where(headm[..., None], flat[..., :3], col)
idx = distance_transform_edt(~covered, return_distances=False, return_indices=True)     # pad the islands
col = col[tuple(idx)]
img.pixels.foreach_set(np.concatenate([col, np.ones((N, N, 1), np.float32)], -1).ravel())
img.filepath_raw = OUT.replace('.glb', '_color.png'); img.file_format = 'PNG'; img.save(); img.pack()
print('baked: front', round(float(hitF[covered].mean()), 3), 'back', round(float(hitB[covered].mean()), 3), 'head', round(float(headm[covered].mean()), 3))
for o in figs.values(): bpy.data.objects.remove(o, do_unlink=True)
# a single material with the atlas
final = bpy.data.materials.new('M_Adventurer'); final.use_nodes = True
fnt = final.node_tree; fb = fnt.nodes['Principled BSDF']; fb.inputs['Roughness'].default_value = 0.85
ftx = fnt.nodes.new('ShaderNodeTexImage'); ftx.image = img
fnt.links.new(ftx.outputs['Color'], fb.inputs['Base Color'])
me.materials.clear(); me.materials.append(final)
for p_ in me.polygons: p_.material_index = 0
me.uv_layers.remove(me.uv_layers['HeadUV'])
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
