"""Render exact Three.js pose snapshots imported into Blender, never a proxy rig.

node scripts/export-character-grips.mjs --phase before --source /tmp/mossvale-character-grips-before.ts
node scripts/export-character-grips.mjs --phase after
blender --background --python scripts/render-character-grips.py
The saved Blender file embeds both runtime sources and exact snapshot metadata.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'assets/source/character-grips.blend'
PREVIEW=ROOT/'assets/source/character-grips-preview.png'
PHASES=['before'] if '--before-only' in sys.argv else ['before','after']
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.name='Actual runtime weapon and gathering grip inspection'
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
def xyz(x,y,z):return(x,-z,y)
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def material(name,value):
 mat=bpy.data.materials.new(name);mat.use_nodes=True
 rgba=tuple(linear(int(value[i:i+2],16)/255) for i in (0,2,4))+(1,)
 shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=rgba;shader.inputs['Roughness'].default_value=.88
 return mat
ivory=material('Inspection labels','E4DDC7');dim=material('Inspection secondary labels','AFBCB1');stage=material('Inspection platforms','3B514A');backdrop=material('Inspection background','24342F')
def label(value,at,size=.17,mat=ivory):
 curve=bpy.data.curves.new(value,'FONT');curve.body=value;curve.align_x='CENTER';curve.size=size
 obj=bpy.data.objects.new(value,curve);scene.collection.objects.link(obj);obj.location=xyz(*at);obj.rotation_euler=(math.pi/2,0,0);curve.materials.append(mat)
def box(name,at,size,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(*at));obj=bpy.context.object;obj.name=name;obj.scale=(size[0],size[2],size[1]);obj.data.materials.append(mat)

total=0
for side,phase in enumerate(PHASES):
 path=Path('/tmp')/f'mossvale-character-grips-{phase}.glb'
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));imported=set(bpy.data.objects)-before
 figures=[obj for obj in imported if obj.type=='MESH']
 assert len(figures)==9,f'Expected all nine exact runtime snapshots for {phase}'
 for obj in figures:
  index=int(obj.get('index'));row=index//3;column=index%3
  x=((column-1)*2.7 + (-4.4 if side==0 else 4.4)) if len(PHASES)==2 else (column-1)*2.7
  y=(1-row)*3.75
  obj.location=xyz(x,y,0);obj.rotation_mode='XYZ'
  obj.rotation_euler[2]=math.radians(-55 if index in [1,2] else -24 if index==0 else 24)
  obj['inspection_source']=str(path);obj['geometry_note']='Baked directly from visible runtime meshes and exact instance matrices; not remodeled.'
  for slot in obj.material_slots:
   if slot.material:
    shader=slot.material.node_tree.nodes.get('Principled BSDF')
    if shader:shader.inputs['Roughness'].default_value=.88
  box(f'{phase} platform {index}',(x,y-.045,-.04),(2.35,.065,1.90),stage)
  label(str(obj.get('label')),(x,y-.31,.35),.17)
  measurement=obj.get('measurement',{})
  gap=float(measurement.get('distance',0))*100
  label(f'Palm / grip distance: {gap:.1f} cm',(x,y-.54,.35),.12,dim)
  if 'drawHandGap' in measurement:
   label(f'Draw hand / string: {float(measurement["drawHandGap"])*100:.1f} cm',(x,y-.72,.35),.12,dim)
  total+=1
 for extension in ['ts','json']:
  source=Path('/tmp')/f'mossvale-character-grips-{phase}.{extension}'
  if source.exists():text=bpy.data.texts.new(f'Runtime {phase}.{extension}');text.write(source.read_text())
 label('BEFORE' if phase=='before' else 'AFTER',((-4.4 if side==0 else 4.4) if len(PHASES)==2 else 0,7.25,.3),.34)

label('MOSSVALE  /  ACTUAL RUNTIME GRIP INSPECTION',(0,7.92,.3),.26)
label('Same exported character geometry, materials and pose timings. Blender provides inspection lighting only.',(0,-5.25,.35),.145,dim)
box('Backdrop',(0,1,-1.60),(200,200,.1),backdrop)
if len(PHASES)==2:box('Comparison divider',(0,1.13,-1.45),(.035,12.5,.025),dim)
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=3200 if len(PHASES)==2 else 1800;scene.render.resolution_y=2500;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.world=bpy.data.worlds.new('Grip inspection world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.16,.20,.18,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
for at,power,size in [((-6,10,9),2100,8),((7,6,5),1600,7),((0,-4,4),650,5)]:
 bpy.ops.object.light_add(type='AREA',location=xyz(*at));lamp=bpy.context.object;lamp.data.energy=power;lamp.data.size=size
 lamp.rotation_euler=(Vector(xyz(0,1,0))-lamp.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz(0,4.2,32));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=18.7 if len(PHASES)==2 else 15.2
camera.rotation_euler=(Vector(xyz(0,1.2,0))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
SOURCE.parent.mkdir(parents=True,exist_ok=True);bpy.context.preferences.filepaths.save_version=0
if len(PHASES)==1:scene.render.filepath='/tmp/mossvale-character-grips-before.png'
else:scene.render.filepath=str(PREVIEW);bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('GRIP_INSPECTION',json.dumps({'phases':PHASES,'exact_runtime_snapshots':total,'preview':scene.render.filepath}))
bpy.ops.render.render(write_still=True)
