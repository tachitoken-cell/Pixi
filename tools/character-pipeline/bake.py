# Bake the colour texture of the front / back / side source figures onto the fused CHR_Adventurer mesh.
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix
bpy.ops.wm.open_mainfile(filepath='/tmp/claude-0/gt/fuse2.blend')
T = bpy.data.objects['CHR_Adventurer']
F, S, B = (bpy.data.objects[n] for n in ("SRC_Front", "SRC_Side", "SRC_Back"))
S2 = S.copy(); S2.data = S.data.copy(); S2.name = "SRC_Side_Mirror"; bpy.context.scene.collection.objects.link(S2)
S2.data.transform(Matrix.Scale(-1, 4, (1, 0, 0)))            # mirrored side figure covers the character's right side
S2.data.flip_normals()

def keep_facing(ob, axis, sign, thresh=0.25):
    """Drop the faces that do not face the source camera (clipped slab planes carry smeared colour)."""
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.normal_update()
    bad = [f for f in bm.faces if f.normal[axis] * sign < -thresh]
    bmesh.ops.delete(bm, geom=bad, context='FACES'); bm.to_mesh(ob.data); bm.free()
keep_facing(F, 1, -1)       # front figure: real surface faces -Y
keep_facing(B, 1, +1)       # back figure (turned): real surface faces +Y
keep_facing(S, 0, +1)       # side figure (turned): real surface faces +X
keep_facing(S2, 0, -1)      # mirrored side: faces -X

# UVs + bake target
for o in bpy.context.selected_objects: o.select_set(False)
bpy.context.view_layer.objects.active = T; T.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')
img = bpy.data.images.new("T_Adventurer_Color", 2048, 2048)
mat = bpy.data.materials.new("M_Adventurer"); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]; bsdf.inputs["Roughness"].default_value = 0.85
tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"]); nt.nodes.active = tex
T.data.materials.clear(); T.data.materials.append(mat)

sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 4
import numpy as np
bk = sc.render.bake; bk.cage_extrusion = 0.06; bk.max_ray_distance = 0.2; bk.margin = 0
bk.use_pass_direct = False; bk.use_pass_indirect = False; bk.use_pass_color = True
N = 2048
def pixels(im): return np.array(im.pixels[:], np.float32).reshape(N, N, 4)
def bake_from(sources, kind='DIFFUSE', cage=0.025, ray=0.09):
    bk.cage_extrusion = cage; bk.max_ray_distance = ray
    img.pixels.foreach_set(np.zeros(N * N * 4, np.float32))
    for o in bpy.data.objects: o.select_set(False)
    for o in sources: o.select_set(True)
    T.select_set(True); bpy.context.view_layer.objects.active = T
    bk.use_selected_to_active = bool(sources)
    if kind == 'NORMAL': bk.normal_space = 'OBJECT'
    bpy.ops.object.bake(type=kind)
    return pixels(img)
layers = {'front': bake_from([F]), 'back': bake_from([B]),
          'side': bake_from([S], cage=0.06, ray=0.16), 'side2': bake_from([S2], cage=0.06, ray=0.16)}
nrm = bake_from([], 'NORMAL')
n = nrm[..., :3] * 2 - 1                                  # object-space normal per texel (Z up, front = -Y)
covered = nrm[..., 3] > 0
w = {'front': np.clip(-n[..., 1], 0, 1) ** 2 * 1.5, 'back': np.clip(n[..., 1], 0, 1) ** 2 * 1.5,
     'side': np.clip(n[..., 0], 0, 1) ** 2, 'side2': np.clip(-n[..., 0], 0, 1) ** 2}
acc = np.zeros((N, N, 3), np.float32); wsum = np.zeros((N, N), np.float32)
for k, L in layers.items():
    hit = L[..., :3].sum(-1) > 0.015                        # missed rays bake black: give them no weight
    wk = (w[k] + 1e-3) * hit
    acc += L[..., :3] * wk[..., None]; wsum += wk
col = acc / np.maximum(wsum, 1e-6)[..., None]
# texels no figure reached: fill from the nearest baked texel
from scipy.ndimage import distance_transform_edt
have = wsum > 0
idx = distance_transform_edt(~have, return_distances=False, return_indices=True)
col = col[tuple(idx)]
out = np.concatenate([col, np.ones((N, N, 1), np.float32)], -1)
img.pixels.foreach_set(out.ravel())
print("coverage", round(float(have[covered].mean()), 4))
img.filepath_raw = '/tmp/claude-0/gt/T_Adventurer_Color.png'; img.file_format = 'PNG'; img.save(); img.pack()
for o in (F, B, S, S2): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath='/tmp/claude-0/gt/adventurer_textured.blend')
print("BAKED")
