"""Rebuild six editable Blender town scenes directly from the game's shared layouts.

Blender --background --python scripts/build-town-scenes.py -- --render
All game assets use linked mesh data; every placement remains independently editable.
"""
import bpy
import json
import math
import subprocess
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/towns-expanded.blend'
DATA = json.loads(subprocess.check_output(['node','--input-type=module','-e',r'''
import { CITY_LAYOUTS, CITY_RADIUS, BANK_HOME_IDS } from './src/city.ts';
import { CITY_SERVICE_NPCS } from './src/city-services.ts';
import { cityRoadPavers, CITY_PAVER_VERTICES, CITY_PAVER_INDICES } from './src/city-road-paving.ts';
import { BUILDINGS } from './src/buildings.ts';
import { groundHeight } from './src/landscape.ts';
import { ZEPPELIN_PORTS } from './src/zeppelin.ts';
import { ZONES } from './src/content.ts';
const cities=CITY_LAYOUTS.map(city=>{
  const grid=[];
  for(let z=-112;z<=132;z+=4)for(let x=-112;x<=112;x+=4)grid.push([city.x+x,groundHeight(city.x+x,city.z+z),city.z+z]);
  return {...city,bankHomeId:BANK_HOME_IDS[city.zone],baseY:groundHeight(city.x,city.z),radius:CITY_RADIUS,grid,beacon:ZONES.find(zone=>zone.id===city.zone)?.beacon,
    services:CITY_SERVICE_NPCS.filter(npc=>npc.zone===city.zone).map(npc=>({...npc,y:groundHeight(npc.x,npc.z)+.08})),
    buildings:BUILDINGS.filter(b=>city.homes.some(h=>h.id===b.id)||city.props.some(p=>p.id===b.id)),
    props:city.props.map(p=>({...p,y:groundHeight(p.x,p.z)+.08})),
    furnishings:city.furnishings.map(p=>({...p,y:p.buildingId?(p.kind==='bank-crest'?4.35:0):groundHeight(p.x,p.z)+.08})),
    paving:cityRoadPavers(city),
    port:ZEPPELIN_PORTS.find(port=>port.id===city.zone)};
});
console.log(JSON.stringify({cities,paverVertices:CITY_PAVER_VERTICES,paverIndices:CITY_PAVER_INDICES}));
'''],cwd=ROOT,text=True))

def xyz(x,y,z):
    return x,-z,y

def linear(value):
    return value/12.92 if value<=.04045 else ((value+.055)/1.055)**2.4

def color(value):
    return tuple(linear(int(value[i:i+2],16)/255) for i in (0,2,4))+(1,)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
library=bpy.context.scene
library.name='Shared game mesh library'
for name in ['city-kit','house-interiors','city-furnishings','zeppelin-kit','frontier-biomes','town-biomes','deed-cottages-merchants']:
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models'/f'{name}.glb'))
models={obj.name:obj for obj in library.objects if obj.parent is None}
manifest=bpy.data.texts.new('Town scene source - actual game layout.json')
manifest.write(json.dumps(DATA,indent=2))

def clone(source,scene,parent=None,skip=None):
    if skip and skip(source):
        return None
    obj=source.copy()
    if source.data:
        obj.data=source.data
    scene.collection.objects.link(obj)
    obj.parent=parent
    for child in source.children:
        clone(child,scene,obj,skip)
    return obj

def placed(name,placement,scene,skip=None):
    obj=clone(models[name],scene,skip=skip)
    obj.name=placement.get('id',name)
    obj.location=xyz(placement['x'],placement['y'],placement['z'])
    obj.rotation_mode='XYZ'
    obj.rotation_euler.z=placement.get('rotation',0)
    obj['gamePlacementId']=placement.get('id',name)
    return obj

def material(name,hexcode):
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=color(hexcode)
    shader.inputs['Roughness'].default_value=.9
    return mat

def mesh_object(name,vertices,faces,scene,mat):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    mesh.materials.append(mat)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    scene.collection.objects.link(obj)
    return obj

def box(name,position,scale,scene,mat,rotation=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(*position))
    obj=bpy.context.object
    obj.name=name
    obj.scale=(scale[0],scale[2],scale[1])
    obj.rotation_euler.z=rotation
    obj.data.materials.append(mat)
    return obj

def tint_tree(root,tint,cache):
    if tint==0xffffff:
        return
    for obj in [root,*root.children_recursive]:
        if obj.type!='MESH':
            continue
        for slot in obj.material_slots:
            source=slot.material
            key=(source.name,tint)
            if key not in cache:
                mat=source.copy()
                mat.name=f'{source.name} - {tint:06x}'
                shader=next((node for node in mat.node_tree.nodes if node.type=='BSDF_PRINCIPLED'),None)
                if shader:
                    target=shader.inputs['Base Color']
                    if target.links:
                        previous=target.links[0].from_socket
                        multiply=mat.node_tree.nodes.new('ShaderNodeMixRGB')
                        multiply.blend_type='MULTIPLY'
                        multiply.inputs[0].default_value=1
                        multiply.inputs[2].default_value=color(f'{tint:06x}')
                        mat.node_tree.links.new(previous,multiply.inputs[1])
                        mat.node_tree.links.new(multiply.outputs[0],target)
                    else:
                        old=target.default_value
                        target.default_value=tuple(old[i]*color(f'{tint:06x}')[i] for i in range(4))
                cache[key]=mat
            slot.link='OBJECT'
            slot.material=cache[key]

def aim(obj,point):
    obj.rotation_euler=(Vector(xyz(*point))-obj.location).to_track_quat('-Z','Y').to_euler()

GROUND={'greenwood':'77A651','amberwild':'929B50','frostmarch':'D7E5E5',
        'hollow':'50445F','sunveil':'CFA667','mistwood':'416F42'}
world=bpy.data.worlds.new('Town daylight')
world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.48
pavers=material('Regional bonded stone paving','FFFFFF')
road_color=pavers.node_tree.nodes.new('ShaderNodeVertexColor')
road_color.layer_name='RoadTint'
pavers.node_tree.links.new(road_color.outputs['Color'],pavers.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
foundation=material('Stone foundation','879184')
cache={}
scenes=[]
for city in DATA['cities']:
    scene=bpy.data.scenes.new(f'{city["zone"]} - {city["name"]}')
    bpy.context.window.scene=scene
    scene.unit_settings.system='METRIC'
    scene['gameRegion']=city['zone']
    scene['gameOrigin']=[city['x'],city['baseY'],city['z']]
    scene['homes']=len(city['homes'])
    scene['cityProps']=len(city['props'])
    scene['roads']=len(city['roads'])
    scene['contract']='Actual world-space placements from src/city.ts, src/buildings.ts and src/zeppelin.ts.'
    scenes.append(scene)
    # Terrain grid samples the same height function as server movement and the renderer.
    vertices=[xyz(*point) for point in city['grid']]
    stride=57
    faces=[(z*stride+x,z*stride+x+1,(z+1)*stride+x+1,(z+1)*stride+x)
           for z in range(61) for x in range(56)]
    # Vertex order is reversed because Blender's horizontal Y corresponds to game -Z.
    ground=mesh_object(city['name']+' ground',vertices,[tuple(reversed(face)) for face in faces],
                       scene,material(city['name']+' biome ground',GROUND[city['zone']]))
    ground['source']='groundHeight sampled every four metres; city plateau retains exact elevation.'
    # Exact runtime coverage, relief, colors and ramp slopes, authored once.
    vertices,faces,tints=[],[],[]
    indices=DATA['paverIndices']
    for paver in city['paving']:
        start=len(vertices)
        for a,b,c in DATA['paverVertices']:
            dx,dz=a*paver['width'],c*paver['depth']
            vertices.append(xyz(paver['x']+dx,paver['y']+b+paver['slopeX']*dx+paver['slopeZ']*dz,paver['z']+dz))
        shade=color(f'{paver["color"]:06x}')
        for offset in range(0,len(indices),3):
            triangle=indices[offset:offset+3]
            faces.append(tuple(start+i for i in triangle))
            tints.extend(tuple(channel*(1 if 4<=i<8 else .6) for channel in shade[:3])+(1,) for i in triangle)
    pavement=mesh_object(city['name']+' individually modelled road pavers',vertices,faces,scene,pavers)
    tint=pavement.data.color_attributes.new(name='RoadTint',type='BYTE_COLOR',domain='CORNER')
    for corner,shade in zip(tint.data,tints):
        corner.color=shade
    pavement['roadDefinitions']=json.dumps(city['roads'])
    # Runtime owns the furnished hall and clocktower in BUILDINGS rather than static props.
    for prop in city['props']:
        if prop['kind'] in ['city-clocktower','city-auction-hall']:
            continue
        landmark=city['zone']!='greenwood' and prop['kind']=='city-fountain' and prop['x']-city['x']==34 and prop['z']-city['z']==24
        obj=placed('town-'+city['zone']+'-landmark' if landmark else prop['kind'],
                   {**prop,'rotation':prop['rotation']+math.pi/2} if landmark else prop,scene)
        if not landmark:
            tint_tree(obj,city['tint'],cache)
    for building in city['buildings']:
        civic=building['kind'] in ['clocktower','auction-hall']
        regional=not civic and city['zone']!='greenwood'
        source='city-'+building['kind'] if civic else 'house-city-'+building['kind']
        deed='deed-'+building['id']
        if deed in models:
            source=deed
        bank=building['id']==city['bankHomeId']
        def skip(obj):
            part=str(obj.get('part',obj.name))
            return (bank and part.startswith('interior-') and part!='interior-floor') or (regional and part.startswith(('roof-','shell-')))
        obj=placed(source,building,scene,skip)
        for prop in city['furnishings']:
            if prop.get('buildingId')!=building['id']:
                continue
            detail=clone(models['furnishing-'+prop['kind']],scene,obj)
            detail.location=xyz(prop['x'],prop['y'],prop['z'])
            detail.rotation_mode='XYZ'
            detail.rotation_euler.z=prop['rotation']
        tint_tree(obj,city['tint'],cache)
        if regional:
            clone(models['frontier-'+city['zone']+'-'+building['kind']],scene,obj)
        box(building['id']+' foundation',(building['x'],building['y']-.14,building['z']),
            (building['width'],.25,building['depth']),scene,foundation,building['rotation'])
    for prop in city['furnishings']:
        if not prop.get('buildingId'):
            regional={'courtyard-tree':'tree','bush-planter':'planter','lantern-statue':'statue'}
            source='town-'+city['zone']+'-'+regional[prop['kind']] if city['zone']!='greenwood' and prop['kind'] in regional else 'furnishing-'+prop['kind']
            obj=placed(source,prop,scene)
            if source.startswith('furnishing-'):
                tint_tree(obj,city['tint'],cache)
    for npc in city['services']:
        placed('city-auctioneer' if npc['role']=='banker' else 'merchant-deed-auctioneer' if npc['id']=='city-deed-auctioneer' else 'merchant-auctioneer',npc,scene)
    # Preserve each quest beacon's existing, initially unlit connected-world stone frame.
    if city.get('beacon'):
        beacon=city['beacon']
        rock={'amberwild':'A49D81','frostmarch':'91A9B7','hollow':'6C597B','sunveil':'B98554','mistwood':'697C56','greenwood':'999F82'}
        frame=material(city['name']+' quest beacon stone',rock[city['zone']])
        x,z=city['x']+beacon['x'],city['z']+beacon['z']
        for side in [-1,1]:
            box(city['zone']+' beacon pillar',(x+side,city['baseY']+1.7,z),(.27,3.4,.27),scene,frame)
        box(city['zone']+' beacon lintel',(x,city['baseY']+3.38,z),(2.35,.3,.85),scene,frame)
    port=city['port']
    placed('zeppelin-dock',port,scene)
    placed('zeppelin',{**port,'id':city['zone']+'-moored-zeppelin','y':port['y']+1.3,'z':port['z']+12},scene)
    # Every scene opens with a useful complete-town composition, including its airfield.
    bpy.ops.object.camera_add(location=xyz(city['x']+180,city['baseY']+174,city['z']+220))
    camera=bpy.context.object
    camera.name=city['name']+' overview camera'
    camera.data.type='ORTHO'
    camera.data.ortho_scale=262
    aim(camera,(city['x'],city['baseY']+4,city['z']+12))
    scene.camera=camera
    bpy.ops.object.light_add(type='SUN',location=xyz(city['x']-80,city['baseY']+140,city['z']+100))
    light=bpy.context.object
    light.data.energy=2.4
    light.data.angle=.13
    aim(light,(city['x'],city['baseY'],city['z']))
    bpy.ops.object.light_add(type='AREA',location=xyz(city['x']+10,city['baseY']+110,city['z']-90))
    light=bpy.context.object
    light.data.energy=45000
    light.data.size=90
    aim(light,(city['x'],city['baseY'],city['z']))
    scene.world=world
    scene.render.engine='CYCLES'
    scene.cycles.samples=24
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1600
    scene.render.resolution_y=1400
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.filepath=str(ROOT/'assets/source'/f'towns-{city["zone"]}-preview.png')
    scene.view_settings.view_transform='AgX'
    # Verify actual editable placements against the independent runtime manifest.
    by_id={obj.get('gamePlacementId'):obj for obj in scene.objects if obj.get('gamePlacementId')}
    for placement in [*city['props'],*city['buildings']]:
        obj=by_id[placement['id']]
        assert (obj.location-Vector(xyz(placement['x'],placement['y'],placement['z']))).length<.001
        angle=placement.get('rotation',0)
        if city['zone']!='greenwood' and placement.get('kind')=='city-fountain' and placement['x']-city['x']==34 and placement['z']-city['z']==24:
            angle+=math.pi/2
        assert (obj.rotation_euler.to_matrix()@Vector((1,0,0))-Vector((math.cos(angle),math.sin(angle),0))).length<.001
    assert len(city['homes'])==17 and len(city['buildings'])==19
    assert len([obj for obj in scene.objects if obj.get('gamePlacementId')==city['zone']+'-moored-zeppelin'])==1

bpy.context.window.scene=scenes[0]
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('TOWN_SCENES '+json.dumps([{'scene':scene.name,'objects':len(scene.objects),
                                'homes':scene['homes'],'props':scene['cityProps'],'roads':scene['roads']} for scene in scenes]))
if '--render' in sys.argv:
    for scene in scenes:
        bpy.context.window.scene=scene
        bpy.ops.render.render(write_still=True)
