"""Author the Apostle's fractured void props in Blender, with shared vertex palettes.
Blender --background --disable-autoexec --python scripts/build-raid-props.py -- --render
"""
import bpy, math, random, subprocess, sys, tempfile
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models/raid-props.glb'
SOURCE = ROOT / 'assets/source/raid-props.blend'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'Horned Apostle - obsidian void relics'
random.seed(43)
COLORS = {
    'stone': (.052,.033,.10,1), 'edge': (.19,.14,.29,1), 'dark': (.018,.011,.038,1),
    'moss': (.23,.045,.46,1), 'brass': (.16,.19,.32,1), 'gold': (.40,.47,.73,1),
    'crystal': (.25,.045,.55,1), 'facet': (.51,.20,.86,1), 'violet': (.46,.075,.90,1),
    'ward': (.14,.39,.70,1), 'ice': (.27,.75,.97,1), 'void': (.004,.002,.014,1),
}
materials = []
for name, rough, metal, emission in [('Void obsidian palette',.72,.12,0),('Void steel palette',.43,.68,0),('Void rune palette',.6,.15,1.3)]:
    material = bpy.data.materials.new(name); material.use_nodes=True
    shader=material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value=rough; shader.inputs['Metallic'].default_value=metal
    tint=material.node_tree.nodes.new('ShaderNodeVertexColor'); tint.layer_name='SanctumTint'
    material.node_tree.links.new(tint.outputs['Color'],shader.inputs['Base Color'])
    if emission:
        material.node_tree.links.new(tint.outputs['Color'],shader.inputs['Emission Color']); shader.inputs['Emission Strength'].default_value=emission
    materials.append(material)
parts=[]; roots={}

def finish(name,color,material=0):
    obj=bpy.context.object;obj.name=name
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.clear();obj.data.materials.append(materials[material])
    attribute=obj.data.color_attributes.new(name='SanctumTint',type='BYTE_COLOR',domain='CORNER')
    for value in attribute.data:value.color=COLORS[color]
    parts.append(obj);return obj

def box(name,location,scale,color='stone',material=0,angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location,rotation=(0,0,angle));obj=bpy.context.object;obj.scale=scale
    return finish(name,color,material)

def cylinder(name,location,radius,depth,color='stone',vertices=12,top=None,material=0):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=radius,radius2=radius if top is None else top,depth=depth,location=location)
    return finish(name,color,material)

def bar(name,a,b,radius,color='brass',material=1,vertices=6):
    direction=Vector(b)-Vector(a)
    obj=cylinder(name,(Vector(a)+Vector(b))/2,radius,direction.length,color,vertices,material=material)
    obj.rotation_euler=direction.to_track_quat('Z','Y').to_euler();return obj

def torus(name,location,radius,tube,color='brass',material=1,vertical=False,segments=32):
    bpy.ops.mesh.primitive_torus_add(major_segments=segments,minor_segments=5,location=location,major_radius=radius,minor_radius=tube,rotation=(math.pi/2 if vertical else 0,0,0))
    return finish(name,color,material)

def ico(name,location,radius,color='crystal',material=0,scale=None,subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions,radius=radius,location=location)
    if scale:bpy.context.object.scale=scale
    return finish(name,color,material)

def crystal(name,base,height,radius,lean=(0,0),color='crystal'):
    vertices=[]
    for z,r,offset in [(0,radius*.7,0),(height*.73,radius,1)]:
        for i in range(6):
            angle=i*math.tau/6+.22
            vertices.append((base[0]+math.cos(angle)*r+lean[0]*offset,base[1]+math.sin(angle)*r+lean[1]*offset,base[2]+z))
    vertices.append((base[0]+lean[0]*1.15,base[1]+lean[1]*1.15,base[2]+height))
    faces=[tuple(reversed(range(6)))]+[(i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6)]+[(i+6,(i+1)%6+6,12) for i in range(6)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);bpy.context.view_layer.objects.active=obj
    finish(name,color)
    tint=obj.data.color_attributes['SanctumTint']
    for face in mesh.polygons:
        if face.index%3==0:
            for loop in face.loop_indices:tint.data[loop].color=COLORS['facet']
    return obj

def rune(name,center,width=.3,color='violet',plane='vertical'):
    # Broken angular sigils sit inside the dark carved panels rather than floating billboards.
    x,y,z=center
    points=[(-.5,-.5),(-.5,.45),(.2,.7),(.55,.15),(0,-.1),(.45,-.55)]
    for i,(a,b) in enumerate(zip(points,points[1:])):
        at=lambda p:(x+p[0]*width,y,z+p[1]*width) if plane=='vertical' else (x+p[0]*width,y+p[1]*width,z)
        bar(name+str(i),at(a),at(b),.017,color,2,5)

def merge(name):
    root=bpy.data.objects.new(name,None);scene.collection.objects.link(root);roots[name]=root
    root['axes']='metres; Y-up/+Z-front; ground origin' if name!='raid-sun' else 'metres; centered origin; radius 6'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();obj=bpy.context.object
    obj.name=name+'-carved-mesh';scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');obj.parent=root
    parts.clear();return root

# A split six-sided crystal grows through a stepped, rune-cut sacrificial altar.
cylinder('Altar foot',(0,0,.14),1.5,.28,'dark',8)
cylinder('Altar bevel',(0,0,.34),1.46,.18,'edge',8,top=1.26)
cylinder('Altar drum',(0,0,.64),1.2,.45,'stone',8)
cylinder('Altar lip',(0,0,.91),1.32,.16,'brass',8,material=1)
cylinder('Shattered socket',(0,0,1.03),1.1,.17,'dark',8,top=.94)
for i in range(8):
    a=i*math.tau/8; x,y=math.sin(a),math.cos(a)
    panel=box('Recessed altar panel',(x*1.17,y*1.17,.65),(.37,.025,.26),'dark',angle=-a)
    glyph=rune('Altar sigil',(x*1.196,y*1.196,.64),.20)
    ico('Altar corner stud',(x*1.32,y*1.32,.91),.07,'gold',1)
    bar('Socket brace',(x*.95,y*.95,1.0),(x*.67,y*.67,1.37),.055)
crystal('Main split amethyst',(0,.07,1.08),2.84,.43,(.08,-.09))
for i in range(6):
    a=i*math.tau/6+.15;x,y=math.cos(a),math.sin(a)
    crystal('Satellite crystal',(.50*x,.50*y,1.04),1.03+(i%3)*.33,.20,(x*.31,y*.31))
    ico('Loose amethyst shard',(.94*x,.94*y,1.13),.16,'facet',0,(1,.6,.6))
for z in [1.42,1.61,1.80,2.18,2.48]:bar('Core luminous fracture',(-.16,-.28,z),(.10,-.29,z+.17),.018,'violet',2)
for i in range(6):
    a=i*math.tau/6;dx,dy=math.sin(a),math.cos(a)
    ico('Suspended void shard',(dx*.68,dy*.68,2.58+(i%2)*.16),.13,'dark',0,(.6,.8,1.8))
    bar('Shard cyan incision',(dx*.68-.04,dy*.68-.05,2.54+(i%2)*.16),(dx*.68+.03,dy*.68-.06,2.67+(i%2)*.16),.012,'ice',2)
merge('raid-crystal')

# A void ward: cold metal rings, broken obsidian segments and a bound cyan core.
cylinder('Ward plinth',(0,0,.12),.85,.24,'dark',8)
cylinder('Ward plinth bevel',(0,0,.30),.80,.18,'edge',8,top=.57)
bar('Ward stem',(0,0,.30),(0,0,1.0),.18,'brass',1,8)
for radius,tube,color,material in [(1.36,.09,'brass',1),(1.19,.045,'ice',2),(.96,.055,'gold',1),(.73,.035,'ward',2)]:
    torus('Concentric oath ring',(0,0,2.12),radius,tube,color,material,True,40)
for i in range(12):
    angle=i*math.tau/12;dx,dz=math.sin(angle),math.cos(angle)
    bar('Ward radial spoke',(dx*.79,0,2.12+dz*.79),(dx*1.42,0,2.12+dz*1.42),.035,'brass',1)
    obj=box('Engraved ward segment',(dx*1.34,.02,2.12+dz*1.34),(.25,.18,.36),'stone');obj.rotation_euler.y=angle
    ico('Ward rune socket',(dx*1.36,-.12,2.12+dz*1.36),.073,'ice',2)
    if i%2==0:rune('Etched ward sigil',(dx*1.33,-.14,2.12+dz*1.33),.16,'violet')
for i in range(4):
    angle=i*math.tau/4;dx,dz=math.sin(angle),math.cos(angle)
    bar('Crown spine',(dx*1.33,.03,2.12+dz*1.33),(dx*1.72,.03,2.12+dz*1.72),.075,'gold',1)
    ico('Spine finial',(dx*1.69,.03,2.12+dz*1.69),.125,'brass',1,(.6,.55,1.5))
ico('Soul stone',(0,-.025,2.12),.66,'ward',2,(1,.36,1.35),2)
for side in [-1,1]:
    for z in [1.72,2.49]:bar('Jewel clasp',(side*.53,-.15,z),(side*.37,-.28,z+.12),.07,'brass',1)
rune('Heart oath',(0,-.29,2.11),.56,'ice')
merge('raid-shield')

# The carved column repeats one shared three-material mesh around the sanctuary.
cylinder('Foundation',(0,0,.17),1.22,.34,'dark',8)
cylinder('Foundation bevel',(0,0,.40),1.2,.16,'edge',8,top=1.04)
cylinder('Lower plinth',(0,0,.65),1.02,.36,'stone',8)
cylinder('Foot bronze belt',(0,0,.88),1.06,.09,'brass',12,material=1)
for tier in range(5):
    z=1.45+tier*.86
    cylinder('Weathered drum',(0,0,z),.75,.82,'edge' if tier%2 else 'stone',12,top=.72)
    for i in range(8):
        a=i*math.tau/8;dx,dy=math.sin(a),math.cos(a)
        box('Fluted recess',(dx*.731,dy*.731,z),(.17,.035,.63),'dark',angle=-a)
        if (i+tier)%4==0:bar('Void in stone seam',(dx*.74,dy*.74,z-.22),(dx*.742+.05,dy*.742,z+.08),.022,'violet',2)
for z in [1.03,3.14,5.34]:
    cylinder('Collar stone',(0,0,z),.84,.17,'dark',12)
    torus('Collar bronze rope',(0,0,z+.06),.83,.055,'brass',1,False,24)
for side in [-1,1]:
    box('Carved oath plaque',(0,side*.77,3.15),(.42,.065,1.30),'brass',1)
    box('Plaque inset',(0,side*.81,3.15),(.31,.028,1.11),'dark')
    for z in [2.83,3.18,3.52]:rune('Column inscription',(0,side*.835,z),.22,'ice')
cylinder('Capital flare',(0,0,5.68),.79,.43,'edge',8,top=1.07)
cylinder('Capital tier',(0,0,5.98),1.13,.20,'stone',8)
for i in range(8):
    a=i*math.tau/8;dx,dy=math.sin(a),math.cos(a)
    ico('Capital worn cornice',(dx*.92,dy*.92,6.13),.29,'brass',1,(.6,.6,1.2))
    bar('Capital stone prong',(dx*.88,dy*.88,6.12),(dx*1.06,dy*1.06,6.53),.095,'edge',0)
ico('Capital sealed star',(0,0,6.51),.46,'violet',2,(.85,.85,1))
merge('raid-column')

# The Black Sun remains dark at its center; the engraved corona carries its silhouette.
ico('Black Sun core',(0,0,0),4.03,'void',0,subdivisions=3)
for radius,tube,color,material in [(4.28,.10,'violet',2),(4.54,.16,'brass',1),(4.84,.04,'gold',2),(5.05,.08,'brass',1)]:
    torus('Corona concentric ring',(0,0,0),radius,tube,color,material,True,64)
for i in range(32):
    angle=i*math.tau/32;dx,dz=math.sin(angle),math.cos(angle)
    length=5.72 if i%4==0 else 5.40 if i%2==0 else 5.18
    bar('Corona ray',(dx*4.54,0,dz*4.54),(dx*length,0,dz*length),.11 if i%2==0 else .065,'gold' if i%4==0 else 'brass',1)
    ico('Corona ray tip',(dx*length,0,dz*length),.17 if i%4==0 else .10,'violet' if i%2 else 'gold',2)
    if i%2==0:
        ico('Corona facet',(dx*4.56,-.15,dz*4.56),.18,'dark',0,(.8,.65,1.25))
        ico('Corona rune',(dx*4.56,-.28,dz*4.56),.071,'gold',2)
# Cracked meridians sit just proud of the orb, giving it depth without a texture or red overlay.
for angle in [-.55,.55]:
    ring=torus('Orb meridian',(0,0,0),4.045,.024,'violet',2,True,64);ring.rotation_euler.z=angle
# Sparse etched cracks lie on the front hemisphere; eclipse fragments retain
# dark mass around the luminous corona instead of turning the whole sun bright.
for i in range(8):
    a=i*math.tau/8+.12;dx,dz=math.sin(a),math.cos(a)
    ico('Eclipse obsidian fragment',(dx*5.10,-.07,dz*5.10),.22,'dark',0,(.65,.6,1.4))
    for n in range(2):
        r1=2.0+n*.30;r2=r1+.30;turn=a+(.035 if n%2 else -.035)
        p=(dx*r1,-math.sqrt(4.04**2-r1**2),dz*r1)
        q=(math.sin(turn)*r2,-math.sqrt(4.04**2-r2**2),math.cos(turn)*r2)
        bar('Void surface fissure',p,q,.014,'violet',2,4)
merge('raid-sun')

OUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
with tempfile.TemporaryDirectory(prefix='raid-props-') as tmp:
    cli=['npx','--yes','@gltf-transform/cli@4.5.0'];dedup=str(Path(tmp)/'dedup.glb');pruned=str(Path(tmp)/'pruned.glb')
    subprocess.run(cli+['dedup',str(OUT),dedup],check=True);subprocess.run(cli+['prune',dedup,pruned,'--keep-leaves','true'],check=True)
    # Core Three.js handles these normalized attributes directly; no decoder or extra download.
    subprocess.run(cli+['quantize',pruned,str(OUT)],check=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
if '--render' in sys.argv:
    for name,x in [('raid-column',-10),('raid-crystal',-5),('raid-shield',0),('raid-sun',9)]:roots[name].location=(x,0,6 if name=='raid-sun' else 0)
    scene.render.engine='CYCLES';scene.render.threads_mode='FIXED';scene.render.threads=4;scene.cycles.samples=32;scene.cycles.use_denoising=True
    scene.render.resolution_x=1800;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    world=bpy.data.worlds.new('Sanctum inspection world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.05,.033,.10,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.world=world
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.04));floor=bpy.context.object;floor.name='Preview floor'
    floor_mat=bpy.data.materials.new('Preview floor');floor_mat.diffuse_color=(.035,.022,.060,1);floor.data.materials.append(floor_mat)
    bpy.ops.object.camera_add(location=(14,-37,19));camera=bpy.context.object;camera.rotation_euler=(Vector((1,0,4))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=31;scene.camera=camera
    for name,loc,power,size in [('Key',(-8,-12,20),4300,12),('Rim',(8,6,18),3000,10),('Fill',(10,-8,9),1800,10)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;light=bpy.data.objects.new(name,data);scene.collection.objects.link(light);light.location=loc;light.rotation_euler=(Vector((0,0,3))-light.location).to_track_quat('-Z','Y').to_euler()
    scene.view_settings.view_transform='AgX';scene.render.filepath=str(ROOT/'assets/source/raid-props-preview.png');bpy.ops.render.render(write_still=True)
print('RAID_PROPS_EXPORT',OUT,OUT.stat().st_size,'bytes; four authored props, three shared palettes')
