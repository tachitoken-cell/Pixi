import bpy, numpy as np
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath='/tmp/claude-0/gt/user2_raw.glb')
ob = [o for o in bpy.data.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = ob.data
co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
top = co[(co[:, 2] > -0.1) & (co[:, 2] < 0.55) & (co[:, 0] < 0.25)]
h, e = np.histogram(top[:, 0], bins=240, range=(-1, 0.25))
occ = h > 20
runs, start = [], None
for i, o in enumerate(occ):
    if o and start is None: start = i
    if not o and start is not None: runs.append((e[start], e[i])); start = None
if start is not None: runs.append((e[start], e[-1]))
for a, b in runs:
    sel = top[(top[:, 0] >= a) & (top[:, 0] < b)]
    print(f"x {a:.3f}..{b:.3f}  z {sel[:,2].min():.3f}..{sel[:,2].max():.3f}  y {sel[:,1].min():.3f}..{sel[:,1].max():.3f} n={len(sel)}")
bpy.ops.wm.save_as_mainfile(filepath='/tmp/claude-0/gt/sheet2.blend')
