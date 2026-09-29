"""Author Mossvale's additive idle loops against its actual runtime geometry.

blender --background --python scripts/build-idle-animations.py -- --render
The shipping GLB contains only named motion pivots. The retained Blender file
contains editable reference rigs and a two-pose gallery for all 30 loops.
"""
import bpy
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path
from mathutils import Vector, Euler, Quaternion

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / 'public/models/idle-animations.glb'
SOURCE = ROOT / 'assets/source/idle-animations.blend'
PREVIEW = ROOT / 'assets/source/idle-animations-preview.png'

# Read the existing Three.js rigid rigs, expanding only visible reference meshes.
# This is authoring data, never another copy of geometry in the runtime download.
extract = r"""
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {makeCharacter,makeEnemy,animateCharacter,setCharacterRaces,setCharacterGear,setCharacterCustomization} from './src/characters.ts';
import {setMountAssets} from './src/mounts.ts';
import {DEFAULT_APPEARANCE} from './src/appearance.ts';
import {MONSTERS} from './src/bestiary.ts';
const assets={};
for(const name of ['race-kit','gear-kit','customization-kit','mounts','village-kit','trainer-kit','monster-kit']){
 const b=readFileSync(`public/models/${name}.glb`);assets[name]=(await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;
}
setCharacterRaces(assets['race-kit']);setCharacterGear(assets['gear-kit']);setCharacterCustomization(assets['customization-kit']);setMountAssets(assets.mounts);
const result={};
function record(kind,root,parts){
 root.updateMatrixWorld(true);const joints=new Set(Object.values(parts).filter(Boolean)),data={};
 for(const [label,part] of Object.entries(parts)){
  if(!part)continue;
  const vertices=[],faces=[],colors=[],inverse=part.matrixWorld.clone().invert(),tint=new THREE.Color(),point=new THREE.Vector3(),instance=new THREE.Matrix4();
  function collect(node){
   if(!node.visible||(node!==part&&joints.has(node)))return;
   if(node.isMesh){
    const g=node.geometry,p=g.attributes.position,idx=g.index,c=g.attributes.color;
    for(let n=0;n<(node.isInstancedMesh?node.count:1);n++){
     const matrix=inverse.clone().multiply(node.matrixWorld);
     if(node.isInstancedMesh){node.getMatrixAt(n,instance);matrix.multiply(instance);}
     if(Math.abs(matrix.determinant())<1e-12)continue;
     const base=vertices.length;tint.copy(node.material.color||new THREE.Color(1,1,1));
     if(node.instanceColor){const color=new THREE.Color();node.getColorAt(n,color);tint.multiply(color);}
     for(let v=0;v<p.count;v++)vertices.push(point.fromBufferAttribute(p,v).applyMatrix4(matrix).toArray());
     for(let v=0;v<(idx?idx.count:p.count);v+=3){const ids=[0,1,2].map(k=>idx?idx.getX(v+k):v+k);faces.push(ids.map(i=>base+i));colors.push(ids.map(i=>{const color=tint.clone();if(c)color.multiply(new THREE.Color().fromBufferAttribute(c,i));return [...color.toArray(),1];}));}
    }
   }
   for(const child of node.children)collect(child);
  }
  collect(part);data[label]={parent:Object.entries(parts).find(([,node])=>node===part.parent)?.[0]||null,position:part.position.toArray(),quaternion:part.quaternion.toArray(),scale:part.scale.toArray(),vertices,faces,colors};
 }
 result[kind]=data;
}
for(const kind of ['player','rider']){
 const root=makeCharacter({...DEFAULT_APPEARANCE,race:'foxfolk',className:'Knight'}),rig=root.userData.rig;
 animateCharacter(root,0,false,false,undefined,false,kind==='rider'?{mount:'horse'}:undefined);
 record(kind,root,{body:rig.body,head:rig.head,'left-arm':rig.leftArm,'right-arm':rig.rightArm,'left-leg':rig.leftLeg,'right-leg':rig.rightLeg,cape:rig.cape,tail:rig.tail});
 if(kind==='rider')result.rider.body.displayLift=assets.mounts.getObjectByName('mount-horse').userData.seatY-rig.leftLeg.position.y;
}
for(const kind of ['horse','wolf']){
 const root=assets.mounts.getObjectByName(`mount-${kind}`),parts={};
 for(const label of ['body','head','tail','front-left','front-right','rear-left','rear-right','front-left-knee','front-right-knee','rear-left-knee','rear-right-knee'])parts[label]=root.getObjectByName(`${kind}-${label}`);
 record(kind,root,parts);
}
for(const kind of ['merchant','warden','healer','riding-trainer','mount-seller','ranger-trainer','knight-trainer','mage-trainer']){
 const root=(assets['village-kit'].getObjectByName(`village-${kind}`)||assets['trainer-kit'].getObjectByName(`village-${kind}`));
 record(kind,root,Object.fromEntries(['body','head','left-arm','right-arm'].map(part=>[part,root.getObjectByName(`village-${kind}-${part}`)])));
}
for(const kind of Object.keys(MONSTERS)){
 const imported=assets['monster-kit'].getObjectByName(kind);
 if(imported){const parts={};imported.traverse(node=>{if(node.name.startsWith(kind+'-'))parts[node.name.slice(kind.length+1)]=node;});record(kind,imported,parts);}
 else{const root=makeEnemy(kind),rig=root.userData.enemyRig;record(kind,root,{body:rig.body,head:rig.head,core:rig.core,'left-arm':rig.arms?.[0],'right-arm':rig.arms?.[1],'left-leg':rig.legs?.[0],'right-leg':rig.legs?.[1],'left-wing':rig.wings?.[0],'right-wing':rig.wings?.[1]});}
}
process.stdout.write(JSON.stringify(result));
"""
models = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', extract], cwd=ROOT, text=True))
assert len(models) == 30
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
library = bpy.context.scene; library.name = 'Idle motion library - real game rigs'
library.unit_settings.system = 'METRIC'; library.render.fps = 30
library.frame_start = 0; library.frame_end = 300
material = bpy.data.materials.new('Runtime voxel palette'); material.use_nodes = True
shader = material.node_tree.nodes.get('Principled BSDF'); shader.inputs['Roughness'].default_value = .8
color = material.node_tree.nodes.new('ShaderNodeVertexColor'); color.layer_name = 'VoxelTint'
material.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
def xyz(x, y, z): return (x, -z, y)
basis = Euler((math.pi / 2, 0, 0)).to_matrix()
def game_quaternion(q):
    return (basis @ Quaternion((q[3], q[0], q[1], q[2])).to_matrix() @ basis.transposed()).to_quaternion()
def rotation(euler): return (basis @ Euler(euler, 'XYZ').to_matrix() @ basis.transposed()).to_quaternion()
def pulse(t, start, end): return math.sin(math.pi * (t-start)/(end-start))**2 if start < t < end else 0
def wave(t, cycles=1): return math.sin(math.tau * cycles * t)
def swell(t, cycles=2): return (1-math.cos(math.tau * cycles * t)) / 2

durations = {'player':8,'rider':9,'horse':10,'wolf':8,'merchant':8,'warden':9,'healer':10,
 'riding-trainer':9,'mount-seller':8,'ranger-trainer':10,'knight-trainer':9,'mage-trainer':10,
 'moss-slime':6,'briar-sentinel':9,'ice-wisp':8,'root-warden':10,'bramble-wolf':8,'briar-boar':9,
 'grove-spider':7,'ember-beetle':8,'dune-scorpion':9,'stone-golem':10,'frost-yeti':9,'crystal-bat':6,
 'marsh-toad':7,'void-stalker':8,'stormhorn-behemoth':10,'briarhorn-elder':10,'rimefang-matriarch':9,'ashen-crown-titan':10}
npcs = ['merchant','warden','healer','riding-trainer','mount-seller','ranger-trainer','knight-trainer','mage-trainer']

def pose(kind, t):
    # All values are game-axis additive deltas. No clip animates the world root.
    changes = {}
    def joint(part, r=(0,0,0), p=(0,0,0), s=(1,1,1)):
        if part in models[kind]: changes[part] = {'r':r, 'p':p, 's':s}
    b=swell(t,2); slow=wave(t); look=pulse(t,.18,.44)-.65*pulse(t,.60,.87)
    if kind in ['player','rider']:
        joint('head',(.015*wave(t,2),.11*look,.012*slow))
        joint('cape',(.035*wave(t,2),.018*slow,.008*wave(t,3)))
        joint('tail',(.012*slow,.18*wave(t,2)+.08*pulse(t,.53,.70),0))
        if kind=='player':
            joint('left-arm',(.015*wave(t,2),0,-.018*b))
            joint('right-arm',(-.012*wave(t,2),0,.018*b))
    elif kind in ['horse','wolf']:
        sniff=pulse(t,.18,.46); toss=pulse(t,.68,.81)
        joint('head',((.10 if kind=='horse' else .075)*sniff-.045*toss,.09*look,.018*slow))
        joint('tail',(.035*swell(t),(.32 if kind=='horse' else .23)*wave(t,3)+.14*pulse(t,.60,.74),0))
        rest=pulse(t,.46,.65)
        joint('front-left',(-.014*rest,0,0))
        joint('front-left-knee',(.027*rest,0,0))
    elif kind in npcs:
        index=npcs.index(kind); gesture=pulse(t,.25,.56)
        joint('head',(.020*wave(t,2)+.035*gesture,(.075+index*.005)*look,.008*slow))
        left,right={
          'merchant':(.018,.070),'warden':(.026,.015),'healer':(.030,.085),
          'riding-trainer':(.028,.045),'mount-seller':(.052,.034),'ranger-trainer':(.015,.048),
          'knight-trainer':(.012,.012),'mage-trainer':(.032,.014),
        }[kind]
        joint('left-arm',(-left*gesture,0,-.009*wave(t,2)))
        joint('right-arm',(-right*gesture,0,.010*wave(t,2)))
    elif kind=='moss-slime':
        joint('body',s=(1+.035*b,1-.045*b,1+.025*b))
    elif kind=='ice-wisp':
        joint('body',(0,.055*slow,0),(0,.075*wave(t,2),0))
        joint('core',(.035*wave(t,2),.16*slow,.06*wave(t,3)))
        joint('left-wing',(.02*slow,0,-.14*wave(t,5)))
        joint('right-wing',(.02*slow,0,.14*wave(t,5)))
    elif kind=='crystal-bat':
        joint('body',(.018*wave(t,3),.03*slow,0),(0,.085*wave(t,3),0))
        joint('head',(.025*wave(t,2),.11*look,0))
        joint('left-wing',(.025*slow,0,.34*wave(t,8)))
        joint('right-wing',(.025*slow,0,-.34*wave(t,8)))
        joint('tail',(.07*wave(t,3),.08*slow,0))
    else:
        breath={'briar-sentinel':.009,'root-warden':.005,'bramble-wolf':.016,'briar-boar':.025,
          'grove-spider':.012,'ember-beetle':.010,'dune-scorpion':.010,'stone-golem':0,
          'frost-yeti':.010,'marsh-toad':.012,'void-stalker':.009,'stormhorn-behemoth':.006,
          'briarhorn-elder':.012,'rimefang-matriarch':.009,'ashen-crown-titan':0}[kind]
        scale=1+breath*b
        if breath:
            joint('body',s=(1,scale,1))
            # Counter torso expansion at grounded child joints; the feet stay fixed.
            for part,data in models[kind].items():
                planted='leg' in part or kind=='marsh-toad' and 'arm' in part
                if planted and data['parent']=='body':
                    joint(part,p=(0,data['position'][1]*(1/scale-1),0),s=(1,1/scale,1))
        if kind=='bramble-wolf':
            joint('head',(.10*pulse(t,.16,.42),.10*look,.018*slow))
            joint('jaw',(.07*pulse(t,.20,.39)+.020*b,0,0))
            joint('tail',(.02*slow,.20*wave(t,3),0))
        elif kind=='briar-boar':
            joint('head',(.095*pulse(t,.17,.40),.055*look,.025*wave(t,3)))
            joint('tail',(.025*slow,.27*wave(t,4),0))
        elif kind=='grove-spider':
            joint('head',(.030*wave(t,3),.065*look,0))
            for part in ['leg-0','leg-1']:
                changes[part]['r']=(0,.015*pulse(t,.35,.54)*(1 if part=='leg-0' else -1),0)
        elif kind=='ember-beetle':
            joint('head',(.025*wave(t,2),.045*look,0))
            joint('left-arm',(0,-.070*pulse(t,.26,.46),-.025*wave(t,3)))
            joint('right-arm',(0,.070*pulse(t,.50,.70),.025*wave(t,3)))
        elif kind=='dune-scorpion':
            joint('head',(.022*slow,.04*look,0))
            joint('left-arm',(.025*wave(t,2),-.05*pulse(t,.18,.43),0))
            joint('right-arm',(.025*wave(t,2),.05*pulse(t,.50,.75),0))
            joint('tail',(.07*swell(t),.045*slow,0))
            joint('stinger',(-.11*pulse(t,.35,.58),.07*wave(t,2),0))
        elif kind in ['briar-sentinel','root-warden']:
            weight=.65 if kind=='root-warden' else 1
            joint('head',(.025*wave(t,2)*weight,.105*look*weight,0))
            joint('core',(0,.030*wave(t,2),.045*slow))
            joint('left-arm',(-.030*b*weight,0,-.018*slow))
            joint('right-arm',(-.025*b*weight,0,.018*slow))
        elif kind=='stone-golem':
            joint('head',(.025*pulse(t,.32,.53),.065*look,0))
            joint('left-arm',(-.028*pulse(t,.47,.70),0,-.010*b))
            joint('right-arm',(-.025*pulse(t,.14,.37),0,.010*b))
        elif kind=='frost-yeti':
            joint('head',(.045*pulse(t,.38,.61),.080*look,-.018*slow))
            joint('left-arm',(-.045*b,0,-.025*slow))
            joint('right-arm',(-.036*b,0,.025*slow))
        elif kind=='marsh-toad':
            joint('head',(.025*b,.040*look,0))
            joint('jaw',(.075*pulse(t,.12,.44)+.055*pulse(t,.62,.83),0,0),s=(1,1+.08*b,1))
        elif kind=='void-stalker':
            joint('head',(-.025*pulse(t,.15,.40),.13*look,.035*slow))
            joint('left-arm',(-.040*pulse(t,.46,.76),0,-.028*b))
            joint('right-arm',(-.026*pulse(t,.20,.48),0,.028*b))
            joint('tail',(.040*slow,.16*wave(t,2),0))
        elif kind=='stormhorn-behemoth':
            joint('head',(.025*b,.038*look,.008*slow))
            joint('jaw',(.038*pulse(t,.25,.56)+.012*b,0,0))
            joint('tail',(.016*slow,.09*wave(t,2),0))
        elif kind=='briarhorn-elder':
            joint('head',(.067*pulse(t,.16,.43),.055*look,.012*slow))
            joint('jaw',(.05*pulse(t,.24,.49),0,0))
            joint('tail',(.024*slow,.17*wave(t,3),0))
        elif kind=='rimefang-matriarch':
            joint('head',(.031*b,.070*look,-.014*slow))
            joint('jaw',(.035*pulse(t,.31,.57),0,0))
            joint('left-arm',(-.037*b,0,-.020*slow))
            joint('right-arm',(-.031*b,0,.020*slow))
        elif kind=='ashen-crown-titan':
            joint('head',(.022*pulse(t,.28,.57),.053*look,0))
            joint('left-arm',(-.022*pulse(t,.47,.76),0,-.009*b))
            joint('right-arm',(-.026*pulse(t,.14,.40),0,.009*b))
            joint('core',(0,0,.028*slow),(0,.018*b,.038*b))
    return changes

rigs={};surfaces={};animated_parts={}
for kind,parts in models.items():
    root=bpy.data.objects.new(kind,None);library.collection.objects.link(root)
    root['description']='Real runtime geometry; only child motion pivots enter the shipping GLB'
    rig={};surfaces[kind]=[]
    # Build all pivots before parenting; imported glTF children are often listed first.
    for label,data in parts.items():
        node=bpy.data.objects.new(kind+'-'+label,None);library.collection.objects.link(node)
        node.empty_display_type='PLAIN_AXES';node.empty_display_size=.12;node.rotation_mode='QUATERNION'
        node.location=xyz(*data['position']);node.rotation_quaternion=game_quaternion(data['quaternion'])
        node.scale=(data['scale'][0],data['scale'][2],data['scale'][1]);rig[label]=node
        mesh=bpy.data.meshes.new(kind+'-'+label+' actual geometry');mesh.from_pydata([xyz(*v) for v in data['vertices']],[],data['faces']);mesh.update()
        tint=mesh.color_attributes.new(name='VoxelTint',type='FLOAT_COLOR',domain='CORNER')
        for face,colors in zip(mesh.polygons,data['colors']):
            for loop,color in zip(face.loop_indices,colors):tint.data[loop].color=color
        surface=bpy.data.objects.new(kind+'-'+label+'-reference',mesh);library.collection.objects.link(surface);surface.parent=node;mesh.materials.append(material);surfaces[kind].append(surface)
    for label,data in parts.items():rig[label].parent=rig[data['parent']] if data['parent'] else root
    duration=durations[kind];end=duration*30
    samples={frame:pose(kind,0 if frame==end else frame/end) for frame in range(0,end+1,3)}
    animated_parts[kind]=list(samples[0])
    for label in animated_parts[kind]:
        node=rig[label];base_position=node.location.copy();base_quaternion=node.rotation_quaternion.copy();base_scale=node.scale.copy()
        use_position=any(any(abs(v)>1e-12 for v in values[label]['p']) for values in samples.values())
        use_scale=any(any(abs(v-1)>1e-12 for v in values[label]['s']) for values in samples.values())
        use_rotation=any(any(abs(v)>1e-12 for v in values[label]['r']) for values in samples.values())
        for frame,values in samples.items():
            value=values[label]
            if use_rotation:
                node.rotation_quaternion=base_quaternion@rotation(value['r']);node.keyframe_insert(data_path='rotation_quaternion',frame=frame)
            if use_position:
                node.location=base_position+Vector(xyz(*value['p']));node.keyframe_insert(data_path='location',frame=frame)
            if use_scale:
                sx,sy,sz=value['s'];node.scale=(base_scale.x*sx,base_scale.y*sz,base_scale.z*sy);node.keyframe_insert(data_path='scale',frame=frame)
        if not node.animation_data:continue
        action=node.animation_data.action;action.name=kind+'-idle-'+label
        for curve in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves:
            for point in curve.keyframe_points:point.interpolation='BEZIER';point.handle_left_type=point.handle_right_type='AUTO_CLAMPED'
        track=node.animation_data.nla_tracks.new();track.name=kind+'-idle'
        strip=track.strips.new(track.name,0,action);strip.extrapolation='NOTHING';node.animation_data.action=None
    rigs[kind]=(root,rig)

library.frame_set(0);bpy.ops.object.select_all(action='DESELECT')
for root,rig in rigs.values():
    root.select_set(True)
    for node in rig.values():node.select_set(True)
for folder in [EXPORT.parent,SOURCE.parent]:folder.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,export_yup=True,
 export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',export_force_sampling=True,
 export_cameras=False,export_lights=False)
if '--optimize' in sys.argv:
    # Remove redundant baked samples without changing pivots or requiring a decoder.
    with tempfile.TemporaryDirectory(prefix='mossvale-idles-') as temporary:
        sampled=str(Path(temporary)/'resampled.glb')
        cli=['npx','--yes','@gltf-transform/cli@4.5.0']
        subprocess.run(cli+['resample',str(EXPORT),sampled,'--tolerance','0.00001'],check=True)
        subprocess.run(cli+['dedup',sampled,str(EXPORT)],check=True)

# The exported library has no meshes. This separate review scene retains actual
# runtime anatomy and equipment at two phases; uniform display fit is gallery-only.
gallery=bpy.data.scenes.new('Idle poses - rest and gesture');bpy.context.window.scene=gallery
gallery.render.engine='CYCLES';gallery.cycles.samples=24;gallery.cycles.use_denoising=True
gallery.render.resolution_x=3200;gallery.render.resolution_y=2000;gallery.render.resolution_percentage=100
gallery.world=bpy.data.worlds.new('Idle gallery world');gallery.world.use_nodes=True
gallery.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.16,.20,.23,1)
gallery.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7;gallery.view_settings.view_transform='AgX'
def flat(name,rgb):
    mat=bpy.data.materials.new(name);mat.diffuse_color=(*rgb,1);mat.use_nodes=True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*rgb,1);return mat
floor_mat=flat('Slate review pedestals',(.065,.090,.097));text_mat=flat('Ivory captions',(.88,.81,.64))
def aim(obj,target):obj.rotation_euler=(Vector(xyz(*target))-obj.location).to_track_quat('-Z','Y').to_euler()
for index,(kind,(root,rig)) in enumerate(rigs.items()):
    col=index%6;row=index//6;cx=col*5.1;cz=-row*4.8
    bpy.context.window.scene=library;library.frame_set(0);bpy.context.view_layer.update()
    display=[(surface,Vector((0,0,0))) for surface in surfaces[kind]]
    if kind=='rider':
        lift=Vector(xyz(0,models['rider']['body']['displayLift'],0))
        display=[(surface,lift) for surface in surfaces[kind]]+[(surface,Vector((0,0,0))) for surface in surfaces['horse']]
    points=[surface.matrix_world@vertex.co+offset for surface,offset in display for vertex in surface.data.vertices]
    low=Vector(tuple(min(p[i] for p in points) for i in range(3)));high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    fit=min(1,1.85/(high.x-low.x),2.1/(high.y-low.y),2.35/(high.z-low.z))
    for side,frame in [(-1,0),(1,round(durations[kind]*30*.33))]:
        library.frame_set(frame);bpy.context.view_layer.update()
        location=Vector(xyz(cx+side*1.13,0,cz))
        for surface,offset in display:
            obj=surface.copy();obj.animation_data_clear();obj.parent=None;obj.matrix_world=surface.matrix_world.copy();gallery.collection.objects.link(obj)
            obj.location+=offset;obj.location*=fit;obj.scale*=fit;obj.location+=location
    bpy.context.window.scene=gallery
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(cx,-.16,cz));pedestal=bpy.context.object;pedestal.scale=(4.85,4.4,.22);pedestal.data.materials.append(floor_mat)
    bpy.ops.object.text_add(location=xyz(cx,-.038,cz+1.99));label=bpy.context.object
    label.data.body=kind.replace('-',' ').title()+f'  |  0 / {durations[kind]*.33:.1f}s';label.data.align_x='CENTER';label.data.size=.185;label.data.materials.append(text_mat)
for at,energy,size in [((0,22,12),5800,14),((26,20,6),5500,12),((12,20,-22),6500,15)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*at));light=bpy.context.object;light.data.energy=energy;light.data.shape='DISK';light.data.size=size;aim(light,(12,0,-9))
bpy.ops.object.camera_add(location=xyz(14,33,32));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=35;aim(camera,(12.75,0,-9.6));gallery.camera=camera
gallery.render.image_settings.file_format='PNG';gallery.render.filepath=str(PREVIEW)
library.frame_set(0);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('IDLE_ANIMATIONS '+json.dumps({'clips':len(rigs),'durations':durations,'parts':animated_parts,'glb_bytes':EXPORT.stat().st_size,'source':str(SOURCE)}))
if '--render' in sys.argv:bpy.ops.render.render(write_still=True)
