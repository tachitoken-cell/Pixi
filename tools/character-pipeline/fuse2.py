import bpy, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from scipy.ndimage import gaussian_filter
from skimage.measure import marching_cubes
bpy.ops.wm.open_mainfile(filepath='/tmp/claude-0/gt/fuse1.blend')
dg = bpy.context.evaluated_depsgraph_get()
F, S, B = (bpy.data.objects[n] for n in ("SRC_Front", "SRC_Side", "SRC_Back"))
bF, bS, bB = (BVHTree.FromObject(o, dg) for o in (F, S, B))
V = 0.004
NO_SIDE = True
xs = np.arange(-0.37, 0.37, V); ys = np.arange(-0.27, 0.31, V); zs = np.arange(-0.01, 1.52, V)

def depth(bvh, orig_fn, d, A, Bv):
    out = np.full((len(A), len(Bv)), np.nan, np.float32)
    for i, a in enumerate(A):
        for j, b in enumerate(Bv):
            h = bvh.ray_cast(orig_fn(a, b), d)
            if h[0] is not None: out[i, j] = h[0].dot(-d) * -1 if False else (h[0].y if d.y != 0 else h[0].x)
    return out
yF = depth(bF, lambda x, z: Vector((x, -2, z)), Vector((0, 1, 0)), xs, zs)
yB = depth(bB, lambda x, z: Vector((x, 2, z)), Vector((0, -1, 0)), xs, zs)
sS = depth(bS, lambda y, z: Vector((2, y, z)), Vector((-1, 0, 0)), ys, zs)
print("rays done")
np.save("/tmp/claude-0/gt/yF.npy", yF); np.save("/tmp/claude-0/gt/yB.npy", yB); np.save("/tmp/claude-0/gt/sS.npy", sS)
from scipy.ndimage import distance_transform_edt, median_filter, generic_filter
def clean_depth(d):
    """Median-filter a depth map (NaN = no hit) to remove the scan-line streaks of the source reliefs."""
    hit = ~np.isnan(d)
    idx = distance_transform_edt(~hit, return_distances=False, return_indices=True)
    filled = d[tuple(idx)]                    # nearest real surface value, so edges are not pulled around
    sm = median_filter(filled, size=(5, 5))
    sm = gaussian_filter(sm, 1.0)
    return sm                                 # continuous everywhere; the silhouettes are handled by sdF / sdB
hitF, hitB = ~np.isnan(yF), ~np.isnan(yB)
yF, yB = clean_depth(yF), clean_depth(yB)
def sdist(hit):            # signed 2D distance (m) to a silhouette, + inside
    return (distance_transform_edt(hit) - distance_transform_edt(~hit)) * V
sdF, sdB, sdS = sdist(hitF), sdist(hitB), sdist(~np.isnan(sS))
sdS = gaussian_filter(sdS, 3.0) + 0.012          # side silhouette: smooth, and let the real back surface win
sdF, sdB = gaussian_filter(sdF, 2.5), gaussian_filter(sdB, 2.5)
yF = np.where(np.isnan(yF), 1.0, yF); yB = np.where(np.isnan(yB), -1.0, yB)
X, Y = np.meshgrid(xs, ys, indexing='ij')
vol = np.zeros((len(xs), len(ys), len(zs)), np.float32)
for k in range(len(zs)):
    f = np.minimum(Y - yF[:, k][:, None], yB[:, k][:, None] - Y)
    f = np.minimum(f, np.minimum(sdF[:, k], sdB[:, k])[:, None])
    vol[:, :, k] = f if NO_SIDE else np.minimum(f, sdS[:, k][None, :])
vol = gaussian_filter(vol, 0.7)
verts, faces, _, _ = marching_cubes(vol, 0.0, spacing=(V, V, V))
verts += np.array([xs[0], ys[0], zs[0]])
me = bpy.data.meshes.new("CHR_Adventurer")
me.from_pydata(verts.tolist(), [], faces[:, ::-1].tolist()); me.update()   # field is + inside: reverse winding so normals face out
ob = bpy.data.objects.new("CHR_Adventurer", me); bpy.context.scene.collection.objects.link(ob)
for p in me.polygons: p.use_smooth = True
print("mc tris", len(faces))
bpy.context.view_layer.objects.active = ob
for o in bpy.context.selected_objects: o.select_set(False)
ob.select_set(True)
m = ob.modifiers.new("Dec", 'DECIMATE'); m.ratio = 40000 / len(faces)
bpy.ops.object.modifier_apply(modifier="Dec")
m = ob.modifiers.new("Smooth", 'CORRECTIVE_SMOOTH'); m.iterations = 4; m.use_only_smooth = True if hasattr(m, 'use_only_smooth') else False
bpy.ops.object.modifier_apply(modifier="Smooth")
print("final tris", sum(len(p.vertices) - 2 for p in me.polygons))
bpy.ops.wm.save_as_mainfile(filepath='/tmp/claude-0/gt/fuse2.blend')
