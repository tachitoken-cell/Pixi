# Cut the front / side / back figures out of the sheet mesh and align them in one character frame
# (metres, Z up, character faces -Y, feet on z=0, height 1.50 m).
import bpy, bmesh, math, numpy as np
from mathutils import Vector, Matrix
bpy.ops.wm.open_mainfile(filepath='/tmp/claude-0/gt/sheet2.blend')
src = [o for o in bpy.data.objects if o.type == 'MESH'][0]

def cut(name, x0, x1, cx0, cx1, z0=-0.1, z1=0.55):
    ob = src.copy(); ob.data = src.data.copy(); ob.name = ob.data.name = name
    bpy.context.scene.collection.objects.link(ob)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not (x0 < v.co.x < x1 and z0 < v.co.z < z1)], context='VERTS')
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-5)
    bm.verts.ensure_lookup_table()
    seen, drop = set(), []
    for v in bm.verts:
        if v.index in seen: continue
        stack, comp = [v], []; seen.add(v.index)
        while stack:
            a = stack.pop(); comp.append(a)
            for e in a.link_edges:
                b = e.other_vert(a)
                if b.index not in seen: seen.add(b.index); stack.append(b)
        c = sum((q.co for q in comp), Vector()) / len(comp)
        if len(comp) < 150 or not (cx0 < c.x < cx1): drop += comp
    bmesh.ops.delete(bm, geom=drop, context='VERTS')
    bm.to_mesh(ob.data); bm.free()
    return ob

F = cut("SRC_Front", -0.97, -0.69, -0.96, -0.72)
S = cut("SRC_Side", -0.48, -0.27, -0.48, -0.27)
B = cut("SRC_Back", -0.06, 0.20, -0.06, 0.20)
bpy.data.objects.remove(src, do_unlink=True)

def co(ob):
    a = np.empty(len(ob.data.vertices) * 3, np.float32); ob.data.vertices.foreach_get('co', a); return a.reshape(-1, 3)

# character frame: B turned 180 deg (its real surface = the back), S turned so its face points -Y
B.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))
S.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Z'))
H = 1.50
for ob in (F, S, B):
    c = co(ob); s = H / (c[:, 2].max() - c[:, 2].min())
    ob.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation((0, 0, -c[:, 2].min())))
# x: centre F and B on their feet; depth: S toe front = F front, B back = S back
def feet_cx(c): f = c[c[:, 2] < 0.05]; return f[:, 0].mean()
cF, cB, cS = co(F), co(B), co(S)
F.data.transform(Matrix.Translation((-feet_cx(cF), 0, 0)))
B.data.transform(Matrix.Translation((-feet_cx(cB), 0, 0)))
S.data.transform(Matrix.Translation((-cS[:, 0].mean(), 0, 0)))
cF, cB, cS = co(F), co(B), co(S)
S.data.transform(Matrix.Translation((0, cF[:, 1].min() - cS[:, 1].min(), 0)))
cS = co(S)
B.data.transform(Matrix.Translation((0, cS[:, 1].max() - cB[:, 1].max(), 0)))
for ob in (F, S, B):
    c = co(ob); print(ob.name, len(c), "min", c.min(0).round(3), "max", c.max(0).round(3))
bpy.ops.wm.save_as_mainfile(filepath='/tmp/claude-0/gt/fuse1.blend')
