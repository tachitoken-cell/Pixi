"""Retain and render actual dungeon floorplans exported by the game renderer.

node scripts/export-dungeon-interior.mjs /tmp/mossvale-dungeon-layouts all
Blender --background --python scripts/build-dungeon-layouts.py -- --render
Optional --input /path/to/manifests; --themed builds the three new full dungeons.
No layout geometry is invented here.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/source'
args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
INPUT = Path(args[args.index('--input')+1]) if '--input' in args else Path('/tmp/mossvale-dungeon-layouts')
THEMED = '--themed' in args
PREFIX = 'themed-dungeon-layouts' if THEMED else 'dungeon-layouts'
SOURCE = OUT / (PREFIX + '.blend')
IDS = ['plagueworks', 'emberfall', 'veilhaven'] if THEMED else ['rootvault', 'cindercrypt', 'frosthollow', 'nightroot']
TINTS = {'rootvault':(.66,.93,.28,1), 'cindercrypt':(1,.59,.24,1), 'frosthollow':(.46,.87,1,1), 'nightroot':(.78,.57,1,1), 'plagueworks':(.66,.86,.33,1), 'emberfall':(1,.46,.21,1), 'veilhaven':(.40,.88,.86,1)}
AXES = Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
def xyz(x,y,z): return Vector((x,-z,y))
def aim(obj,at):obj.rotation_euler=(Vector(at)-obj.location).to_track_quat('-Z','Y').to_euler()

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for scene in list(bpy.data.scenes)[1:]:bpy.data.scenes.remove(scene)
for material in list(bpy.data.materials):bpy.data.materials.remove(material)
OUT.mkdir(parents=True,exist_ok=True)


def material_for(batch,prefix):
    settings=batch['material'];mat=bpy.data.materials.new(prefix+' '+batch['name']);mat.use_nodes=True
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;shader=nodes.get('Principled BSDF')
    vertex=nodes.new('ShaderNodeVertexColor');vertex.layer_name='Color'
    links.new(vertex.outputs['Color'],shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value=settings.get('roughness',.84)
    shader.inputs['Metallic'].default_value=settings.get('metalness',0)
    if settings.get('unlit'):
        emission=nodes.new('ShaderNodeEmission');links.new(vertex.outputs['Color'],emission.inputs['Color']);emission.inputs['Strength'].default_value=1
        links.new(emission.outputs[0],nodes.get('Material Output').inputs['Surface'])
    elif max(settings.get('emissive',[0,0,0]))>0:
        shader.inputs['Emission Color'].default_value=tuple(settings['emissive'])+(1,)
        shader.inputs['Emission Strength'].default_value=settings.get('emissiveIntensity',1)
    if settings.get('transparent'):
        shader.inputs['Alpha'].default_value=settings.get('opacity',1)
        mat.surface_render_method='DITHERED'
    mat['runtime_water']=bool(settings.get('water'))
    return mat


def runtime_collection(manifest):
    name=manifest['id'];collection=bpy.data.collections.new(name+' | Exact runtime geometry')
    meshes={};tinted_meshes={}
    for data in manifest['geometries']:
        mesh=bpy.data.meshes.new(name+' geometry '+str(data['id']))
        vertices=list(zip(*[iter(data['positions'])]*3));indices=data.get('indices') or list(range(len(vertices)))
        mesh.from_pydata(vertices,[],list(zip(*[iter(indices)]*3)));mesh.update()
        assert len(mesh.polygons)*3==len(indices),'all exported runtime triangles retained'
        colors=data.get('colors');layer=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        for loop in mesh.loops:
            i=loop.vertex_index*3
            layer.data[loop.index].color=tuple(colors[i:i+3])+(1,) if colors else (1,1,1,1)
        meshes[data['id']]=mesh
    for batch in manifest['batches']:
        material=material_for(batch,name);source_mesh=meshes[batch['geometry']]
        for index,instance in enumerate(batch['instances']):
            tint=instance.get('color',[1,1,1]);base=batch['material'].get('color',[1,1,1]);final_tint=tuple(a*b for a,b in zip(tint,base))
            key=(batch['geometry'],final_tint)
            if key not in tinted_meshes:
                mesh=source_mesh.copy();mesh.name=source_mesh.name+' tint '+str(len(tinted_meshes))
                for corner in mesh.color_attributes['Color'].data:corner.color=tuple(a*b for a,b in zip(corner.color[:3],final_tint))+(1,)
                tinted_meshes[key]=mesh
            mesh=tinted_meshes[key]
            obj=bpy.data.objects.new(f"{name} | {batch['name']} | {index+1}",mesh);collection.objects.link(obj)
            values=instance['matrix'];obj.matrix_world=AXES@Matrix([values[i::4] for i in range(4)])
            assert all(math.isfinite(value) for row in obj.matrix_world for value in row)
            if not mesh.materials:mesh.materials.append(material)
            obj.material_slots[0].link='OBJECT';obj.material_slots[0].material=material
            obj.color=final_tint+(1,)
            obj['runtime_batch']=batch['name'];obj['runtime_instance']=index
            object_ids=batch.get('objectIds')
            if object_ids and object_ids[index]:obj['runtime_object_id']=object_ids[index]
    assert len(collection.objects)==sum(len(batch['instances']) for batch in manifest['batches'])
    return collection


def configure(scene,center,scale,resolution,path):
    bpy.context.window.scene=scene
    scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=3
    scene.render.resolution_x,scene.render.resolution_y=resolution;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(path);scene.view_settings.view_transform='AgX'
    bpy.ops.object.camera_add(location=xyz(center[0],scale*1.3,center[1]+scale*.82))
    camera=bpy.context.object;camera.name='Overview camera';camera.data.type='ORTHO';camera.data.ortho_scale=scale
    camera.data.clip_end=4000;aim(camera,xyz(center[0],0,center[1]));scene.camera=camera
    camera.data.lens=42;camera.data.dof.use_dof=False
    for offset,power,size in [((-scale*.28,scale*.90,scale*.35),scale*scale*1.7,scale*.95),((scale*.4,scale*.55,-scale*.25),scale*scale*.75,scale*.8)]:
        at=xyz(center[0]+offset[0],offset[1],center[1]+offset[2]);bpy.ops.object.light_add(type='AREA',location=at)
        light=bpy.context.object;light.name='Preview softbox';light.data.energy=power;light.data.size=size;aim(light,xyz(center[0],0,center[1]))
    bpy.ops.object.light_add(type='SUN',location=xyz(-20,40,30));sun=bpy.context.object;sun.name='Preview sun';sun.data.energy=1.1;sun.data.angle=.24;aim(sun,xyz(0,0,0))
    scene.world=bpy.data.worlds.new(scene.name+' world');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.17,.21,.24,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
    bpy.ops.mesh.primitive_plane_add(size=scale*5,location=xyz(center[0],-1.0,center[1]))
    floor=bpy.context.object;floor.name='Presentation backdrop | not gameplay'
    mat=bpy.data.materials.new(scene.name+' backdrop');mat.use_nodes=True;mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.019,.026,.032,1);floor.data.materials.append(mat)
    bpy.context.view_layer.update()
    return camera


def title(camera,text,x,y,size,color):
    # Camera-aligned labels belong to presentation scenes, never the runtime collections.
    font=bpy.data.curves.new(text,'FONT');font.body=text;font.size=size;font.extrude=0;font.space_character=1.08
    obj=bpy.data.objects.new(text,font);bpy.context.scene.collection.objects.link(obj)
    obj.matrix_world=camera.matrix_world.copy();obj.location=camera.matrix_world@Vector((x,y,-10))
    mat=bpy.data.materials.new('Label '+text);mat.use_nodes=True;shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=color;shader.inputs['Emission Color'].default_value=color;shader.inputs['Emission Strength'].default_value=1
    font.materials.append(mat)
    obj.visible_shadow=False


manifests=[json.loads((INPUT/(name+'.json')).read_text()) for name in IDS]
assert [m['id'] for m in manifests]==IDS
collections={};scenes=[];stats=[]
for index,manifest in enumerate(manifests):
    name=manifest['id'];bounds=manifest['bounds'];center=((bounds['minX']+bounds['maxX'])/2,(bounds['minZ']+bounds['maxZ'])/2)
    scene=bpy.data.scenes[0] if index==0 else bpy.data.scenes.new(manifest['name'])
    scene.name=manifest['name']
    collection=runtime_collection(manifest);scene.collection.children.link(collection);collections[name]=collection
    scene['runtime_id']=name;scene['source']='scripts/export-dungeon-interior.mjs → createDungeonWorld; original transforms, materials, gates, pools, and cover'
    scene['snapshot_state']=manifest['state'];scene['rooms']=len(manifest['layout']['rooms']);scene['gates']=len(manifest['layout']['gates']);scene['pools']=len(manifest['layout']['pools']);scene['encounters']=len(manifest.get('stages',[]));scene['enemies']=sum(len(stage['enemies']) for stage in manifest.get('stages',[]))
    scale=max(bounds['maxX']-bounds['minX'],(bounds['maxZ']-bounds['minZ'])*.86)*1.24
    camera=configure(scene,center,scale,(1400,1400),OUT/f'dungeon-layout-{name}.png')
    title(camera,manifest['name'].upper(),-scale*.43,scale*.435,scale*.027,TINTS[name])
    title(camera,f"LEVELS {manifest['minLevel']}–{manifest['maxLevel']}  /  PLAYABLE LAYOUT",-scale*.43,scale*.403,scale*.011,(.58,.67,.70,1))
    scenes.append(scene);stats.append({'id':name,'objects':len(collection.objects),'meshes':len(manifest['geometries']),'rooms':scene['rooms'],'gates':scene['gates'],'pools':scene['pools'],'encounters':scene['encounters'],'enemies':scene['enemies']})

comparison=bpy.data.scenes.new('00 Three themed dungeon layouts | Same scale' if THEMED else '00 Four dungeon layouts | Same scale')
widths=[m['bounds']['maxX']-m['bounds']['minX'] for m in manifests]
depths=[m['bounds']['maxZ']-m['bounds']['minZ'] for m in manifests]
spacing=max(widths)*1.15+12
comparison_width=spacing*(len(manifests)-1)+max(widths)
comparison_scale=max(comparison_width,max(depths)*.86*(2400/1400))*1.17 if THEMED else 400
def comparison_position(i): return ((i-(len(manifests)-1)/2)*spacing,0) if THEMED else ((-1 if i%2==0 else 1)*72,(-1 if i<2 else 1)*100)
bpy.context.window.scene=comparison
for i,manifest in enumerate(manifests):
    bounds=manifest['bounds'];cx=(bounds['minX']+bounds['maxX'])/2;cz=(bounds['minZ']+bounds['maxZ'])/2
    ox,oz=comparison_position(i)
    instance=bpy.data.objects.new(manifest['name']+' | Linked runtime collection',None);comparison.collection.objects.link(instance)
    instance.instance_type='COLLECTION';instance.instance_collection=collections[manifest['id']];instance.location=xyz(ox-cx,0,oz-cz)
    instance['runtime_id']=manifest['id']
camera=configure(comparison,(0,0),comparison_scale,(2400,1400) if THEMED else (2000,1800),OUT/(PREFIX+'-overview.png'))
# Each label uses the same projected placement, so the comparison keeps one physical scale.
for i,manifest in enumerate(manifests):
    ox,oz=comparison_position(i)
    point=camera.matrix_world.inverted()@xyz(ox-widths[i]/2,0,oz-depths[i]/2-max(10,depths[i]*.05))
    font_size=widths[i]*.041 if THEMED else 4.8
    title(camera,manifest['name'].upper(),point.x,point.y+font_size*.9,font_size,TINTS[manifest['id']])
    subtitle=f"LEVELS {manifest['minLevel']}–{manifest['maxLevel']}"
    if THEMED: subtitle+=f" / {len(manifest.get('stages',[]))} ENCOUNTERS"
    title(camera,subtitle,point.x,point.y-font_size*.25,font_size*.54,(.59,.68,.73,1))
comparison['composition']=f'All {len(IDS)} exact runtime collections instanced at the same scale; only labels, camera, lighting, and backdrop are presentation.'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('DUNGEON_LAYOUTS '+json.dumps({'source':str(SOURCE),'scenes':stats,'comparison_instances':len(IDS)}))
if '--render' in args:
    for scene in ([comparison] if '--comparison-only' in args else [comparison]+scenes):
        bpy.context.window.scene=scene;bpy.ops.render.render(write_still=True)
    bpy.context.window.scene=comparison
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
