# Rig the fused Adventurer with the same pivots the game's procedural character uses, then export a GLB.
import bpy, sys
from mathutils import Vector, Matrix
bpy.ops.wm.open_mainfile(filepath='/tmp/claude-0/gt/adventurer_textured.blend')
ob = bpy.data.objects['CHR_Adventurer']
ob.data.transform(Matrix.Translation((-0.018, -0.02, 0)))           # centre between the feet
bpy.context.view_layer.objects.active = ob
for o in bpy.context.selected_objects: o.select_set(False)
ob.select_set(True)
m = ob.modifiers.new("Dec", 'DECIMATE'); m.ratio = 24000 / 40000
bpy.ops.object.modifier_apply(modifier="Dec")
for p in ob.data.polygons: p.use_smooth = True

# bones: name -> (head, tail, parent). Names match the game's pivot groups.
B = {
    'Body':  ((0, 0, 0.55), (0, 0, 0.62), None),
    'Torso': ((0, 0, 0.62), (0, 0, 1.00), 'Body'),
    'Neck':  ((0, 0, 1.02), (0, 0, 1.40), 'Torso'),
    'ArmL':  ((0.15, 0, 0.90), (0.27, 0, 0.64), 'Torso'),
    'HandL': ((0.27, 0, 0.64), (0.30, 0, 0.52), 'ArmL'),
    'ArmR':  ((-0.15, 0, 0.90), (-0.27, 0, 0.64), 'Torso'),
    'HandR': ((-0.27, 0, 0.64), (-0.30, 0, 0.52), 'ArmR'),
    'LegL':  ((0.10, 0, 0.52), (0.11, 0, 0.08), 'Body'),
    'LegR':  ((-0.10, 0, 0.52), (-0.11, 0, 0.08), 'Body'),
}
arm = bpy.data.armatures.new("RIG_Adventurer"); rig = bpy.data.objects.new("RIG_Adventurer", arm)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for name, (h, t, par) in B.items():
    e = arm.edit_bones.new(name); e.head = h; e.tail = t
    if par: e.parent = arm.edit_bones[par]; e.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for o in bpy.context.selected_objects: o.select_set(False)
ob.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
counts = {g.name: 0 for g in ob.vertex_groups}
for v in ob.data.vertices:
    for x in v.groups:
        if x.weight > 0.5: counts[ob.vertex_groups[x.group].name] += 1
print("vertex groups (verts with weight > 0.5):", counts)
bpy.ops.wm.save_as_mainfile(filepath='/tmp/claude-0/gt/adventurer_rigged.blend')
bpy.ops.export_scene.gltf(filepath=sys.argv[-1], export_format='GLB', use_selection=False, export_yup=True,
                          export_animations=False, export_skins=True, export_image_format='JPEG', export_jpeg_quality=90)
print("EXPORTED")
