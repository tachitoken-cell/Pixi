"""Render original voxel fish and dream keepsakes in the incumbent loot-icon style."""
import bpy, math
from pathlib import Path
from mathutils import Vector
out = Path(__file__).resolve().parents[1] / 'public/ui/loot'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 24
scene.render.resolution_x = scene.render.resolution_y = 192; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'; scene.render.film_transparent = True
scene.world.color = (.5, .5, .5)
scene.view_settings.view_transform = 'Standard'
bpy.ops.object.camera_add(location=(3,-5,3)); camera=bpy.context.object
camera.rotation_euler = (Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'; camera.data.ortho_scale=3.5; scene.camera=camera
bpy.ops.object.light_add(type='AREA',location=(-3,-4,6)); bpy.context.object.data.energy=450; bpy.context.object.data.shape='DISK'; bpy.context.object.data.size=5
parts=[]
def block(point,scale,color):
    bpy.ops.mesh.primitive_cube_add(size=1,location=point); obj=bpy.context.object; obj.scale=scale
    mat=bpy.data.materials.new('Pigment'); mat.diffuse_color=(*color,1); mat.use_nodes=True; mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1); mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.75; obj.data.materials.append(mat); parts.append(obj); return obj
for item,color in [('brook-trout',(.32,.58,.56)),('silver-carp',(.65,.73,.68)),('glacial-char',(.40,.62,.84)),('moonfin',(.66,.48,.83)),('dream-petal',(.73,.89,.68)),('nightmare-shard',(.67,.34,.76))]:
    for part in parts: bpy.data.objects.remove(part,do_unlink=True)
    parts=[]
    if item in ('dream-petal','nightmare-shard'):
        if item=='dream-petal':
            for i in range(5):
                a=i*math.tau/5; block((math.cos(a)*.55,math.sin(a)*.55,0),(.7,.7,.25),color).rotation_euler.z=a
            block((0,0,.2),(.55,.55,.3),(.98,.78,.45))
        else:
            for i in range(3):
                part=block(((i-1)*.45,0,i*.15),(.4,.5,1.3-i*.15),color);part.rotation_euler.y=(i-1)*.35
            block((0,-.27,.25),(.12,.05,.9),(.95,.68,.93))
    else:
        block((0,0,0),(1.65,.52,.62),color);block((.15,0,.28),(1.2,.45,.12),tuple(min(1,c+.2) for c in color))
        block((-.95,0,0),(.35,.22,.35),color);block((-1.25,0,0),(.35,.18,.8),color)
        block((-.1,0,.5),(.55,.14,.4),color);block((.62,-.29,.12),(.14,.04,.14),(.10,.18,.19))
        block((.55,-.32,.2),(.04,.03,.04),(.95,.96,.88))
    scene.render.filepath=str(out/f'{item}.png');bpy.ops.render.render(write_still=True)
