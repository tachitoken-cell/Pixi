"""Render collection icons from the authored Apostle geometry; Blender --background --python scripts/build-raid-icons.py."""
import bpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/source/horned-apostle/horned-apostle-rigged.blend'),load_ui=False,use_scripts=False)
scene=bpy.context.scene
scene.frame_set(0)
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=scene.render.resolution_y=256;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
world=bpy.data.worlds.new('Raid icon studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.26,.3,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
original=list(bpy.data.objects)
bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';scene.camera=camera
lights=[]
for name,color in [('Key',(1,.86,.62)),('Fill',(.63,.76,1))]:
 data=bpy.data.lights.new(name,'AREA');data.color=color;data.shape='DISK';obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);lights.append(obj)
for kind,out in [('horned-apostle','pets/death-apostle.png'),('apostle-crown','gear/death-horns.png'),('apostle-wings','raid/wings.png'),('apostle-aura','raid/aura.png'),('apostle-weapon','raid/weapon.png')]:
 root=bpy.data.objects[kind];root.location=(0,0,0)
 allowed={root,*root.children_recursive}
 for obj in original:obj.hide_render=obj not in allowed
 if kind=='horned-apostle':
  for suffix in ['left-wing','right-wing','left-lower-arm','right-lower-arm','halo','halo-gem','stars']:
   node=bpy.data.objects.get(kind+'-'+suffix)
   if node:
    for obj in [node,*node.children_recursive]:obj.hide_render=True
 meshes=[obj for obj in allowed if obj.type=='MESH' and not obj.hide_render]
 bpy.context.view_layer.update()
 points=[obj.matrix_world@Vector(corner) for obj in meshes for corner in obj.bound_box]
 low=Vector(tuple(min(p[i] for p in points) for i in range(3)));high=Vector(tuple(max(p[i] for p in points) for i in range(3)));center=(low+high)/2;radius=max(high-low)/2
 camera.location=center+Vector((radius*.8,-radius*4,radius*.65));camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=radius*2.7
 for light,offset,power in zip(lights,[(-2,-3,4),(3,1,2)],[500,350]):
  light.location=center+Vector(offset)*radius;light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler();light.data.energy=power*radius*radius;light.data.size=radius*3
 path=ROOT/'public/ui'/out;path.parent.mkdir(parents=True,exist_ok=True);scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);print('Rendered',path)
