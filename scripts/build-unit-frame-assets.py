"""Render Mossvale unit-frame chrome from actual Blender geometry.

Blender --background --python scripts/build-unit-frame-assets.py
PNG pixels: 100 per Blender unit, orthographic +Z camera, transparent film.
The portrait aperture is real empty geometry, never a painted or masked circle.
"""
import bpy
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/ui'
SOURCE=ROOT/'assets/source/unit-frames.blend'
PREVIEW=ROOT/'assets/source/unit-frames-preview.png'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def material(name,hex,rough=.65,metal=0,texture=None):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    tree=mat.node_tree;shader=tree.nodes.get('Principled BSDF')
    rgb=tuple(linear(int(hex[i:i+2],16)/255) for i in (0,2,4))
    shader.inputs['Base Color'].default_value=(*rgb,1)
    shader.inputs['Roughness'].default_value=rough;shader.inputs['Metallic'].default_value=metal
    if texture:
        coord=tree.nodes.new('ShaderNodeTexCoord');mapping=tree.nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY'
        mapping.inputs[1].default_value=(2,38,7) if texture=='wood' else (55,55,55)
        tree.links.new(coord.outputs['Generated'],mapping.inputs[0])
        noise=tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=3 if texture=='wood' else 5
        noise.inputs['Detail'].default_value=3;noise.inputs['Roughness'].default_value=.8
        tree.links.new(mapping.outputs['Vector'],noise.inputs['Vector'])
        ramp=tree.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position=.12;ramp.color_ramp.elements[0].color=(*[v*.48 for v in rgb],1)
        ramp.color_ramp.elements[1].position=.88;ramp.color_ramp.elements[1].color=(*[min(1,v*1.35) for v in rgb],1)
        tree.links.new(noise.outputs['Fac'],ramp.inputs[0]);tree.links.new(ramp.outputs['Color'],shader.inputs['Base Color'])
        bump=tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.26 if texture=='wood' else .13
        bump.inputs['Distance'].default_value=.025 if texture=='wood' else .010
        tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);tree.links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    return mat

wood=material('Carved dark oak','6B482D',.75,texture='wood')
woodlight=material('Oak bevel highlights','956A42',.68,texture='wood')
dark=material('Recessed oak edges','35291F',.8,texture='wood')
brass=material('Warm worn brass','BF974F',.34,.65)
brasslight=material('Polished brass edges','E6C779',.30,.60)
leather=material('Dark forest leather','193B2B',.90,texture='leather')
leaf=material('Mossvale leaves','597729',.9)
leaflight=material('Leaf facets','8E9C40',.85)
moss=material('Soft old moss','587A29',.9)
mosslight=material('Moss highlights','8EA843',.9)
amber=material('Lantern amber glass','E8BA5A',.3)
amber.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(.62,.29,.048,1)
amber.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.32

def scene(name,width,height,ortho):
    s=bpy.data.scenes.new(name);bpy.context.window.scene=s
    s.render.engine='CYCLES';s.cycles.samples=64;s.cycles.use_denoising=True
    s.render.resolution_x=width;s.render.resolution_y=height;s.render.resolution_percentage=100
    s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.render.image_settings.color_depth='8'
    s.render.film_transparent=True;s.render.filter_size=1.25;s.view_settings.view_transform='AgX'
    s.world=bpy.data.worlds.new(name+' light');s.world.use_nodes=True
    s.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.21,.25,.23,1)
    s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
    for at,power,size,tint in [((-3,4,6),520,4,(1,.86,.68)),((3,-1,5),210,5,(.77,.88,1))]:
        bpy.ops.object.light_add(type='AREA',location=at);obj=bpy.context.object
        obj.data.energy=power;obj.data.size=size;obj.data.color=tint
        obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(0,0,10));camera=bpy.context.object
    camera.data.type='ORTHO';camera.data.ortho_scale=ortho;camera.rotation_euler=(0,0,0);s.camera=camera
    root=bpy.data.objects.new(name+' geometry',None);s.collection.objects.link(root)
    return s,root

def box(name,x,y,z,w,h,d,mat,bevel=.015,angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));obj=bpy.context.object;obj.name=name
    obj.scale=(w,h,d);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.rotation_euler.z=angle;obj.data.materials.append(mat);obj.parent=active
    if bevel:
        mod=obj.modifiers.new('Carved edge','BEVEL');mod.width=bevel;mod.segments=1
        mod=obj.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return obj

def ring(name,profile,mat,count=64):
    vertices=[(math.cos(i*math.tau/count)*r,math.sin(i*math.tau/count)*r,z) for r,z in profile for i in range(count)]
    faces=[]
    for row in range(len(profile)):
        for i in range(count):faces.append((row*count+i,row*count+(i+1)%count,((row+1)%len(profile))*count+(i+1)%count,((row+1)%len(profile))*count+i))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(mat);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj);obj.parent=active
    return obj

def foliage(x,y,z,length=.29,angle=0):
    # Faceted leaf with a raised midrib, all geometry outside the portrait aperture.
    vertices=[(0,-length/2,0),(-length*.26,-length*.18,0),(-length*.25,length*.13,0),(0,length/2,0),
              (length*.25,length*.13,0),(length*.26,-length*.18,0),(0,-length*.22,.025),(0,length*.22,.035)]
    faces=[(0,1,6),(1,2,7,6),(2,3,7),(3,4,7),(4,5,6,7),(5,0,6)]
    mesh=bpy.data.meshes.new('Faceted leaf');mesh.from_pydata(vertices,[],faces);mesh.materials.append(leaf);mesh.materials.append(leaflight)
    for face in mesh.polygons:face.material_index=face.index%2
    obj=bpy.data.objects.new('Mossvale leaf',mesh);bpy.context.scene.collection.objects.link(obj)
    obj.location=(x,y,z);obj.rotation_euler.z=angle;obj.parent=active
    box('Leaf midrib',x,y,z+.025,.009,length*.71,.013,brass,bevel=0,angle=angle)

def moss_patch(x,y,z,seed,span=.20):
    rng=random.Random(seed)
    for i in range(13):
        xx=x+(rng.random()-.5)*span;yy=y+(rng.random()-.5)*span;size=.015+rng.random()*.030
        box('Little moss facet',xx,yy,z,size,size*.72,size*.50,mosslight if i%4==0 else moss,bevel=.004)

def rivet(x,y,z,size=.105):
    box('Inset ironwood socket',x,y,z,size*1.65,size*1.65,.065,dark,.025)
    box('Brass diamond rivet',x,y,z+.055,size,size,.065,brass,.012,math.pi/4)
    box('Rivet glint',x-.019,y+.019,z+.092,size*.25,size*.25,.012,brasslight,.003,math.pi/4)

portrait,active=scene('Portrait bezel',256,256,2.56);portrait_root=active
ring('Carved faceted oak bezel',[(.90,.015),(1.195,.015),(1.23,.060),(1.209,.155),(1.168,.195),(.99,.195),(.95,.13),(.90,.13)],wood,64)
ring('Outer oak chamfer',[(1.19,.10),(1.23,.060),(1.209,.155),(1.188,.176)],woodlight,64)
ring('Brass inner lip',[(.88,.10),(.88,.195),(.894,.22),(.938,.22),(.952,.19),(.95,.105)],brass,96)
ring('Fine inner highlight',[(.881,.195),(.894,.22),(.906,.22),(.900,.208)],brasslight,96)
ring('Outer brass hairline',[(1.173,.179),(1.180,.186),(1.186,.18),(1.182,.173)],brass,64)
for angle in [math.radians(a) for a in (47,137,227,317)]:rivet(math.cos(angle)*1.063,math.sin(angle)*1.063,.197,.094)
for angle in [math.radians(a) for a in (15,70,108,163,199,250,290,341)]:
    box('Radial oak carving',math.cos(angle)*1.075,math.sin(angle)*1.075,.197,.012,.16,.010,dark,0,angle-math.pi/2)
for x,y,turn,size in [(-.86,.90,-.6,.28),(-1.0,.72,.6,.23),(-.68,1.04,-.2,.23),(.92,-.85,.6,.23),(.76,-1.01,-.5,.21)]:foliage(x,y,.24,size,turn)
for x,y,seed in [(-.94,.79,3),(-.71,1.0,9),(.84,-.94,12)]:moss_patch(x,y,.23,seed,.17)
# Small hanging lantern accent at two o'clock, clear of the portrait opening.
box('Lantern glass',.95,.75,.27,.105,.16,.065,amber,.012)
for yy in [.647,.853]:box('Lantern brass cap',.95,yy,.29,.165,.045,.075,brass,.006)
for xx in [.886,1.014]:box('Lantern brass cage',xx,.75,.305,.019,.195,.025,brasslight,.003)
box('Lantern hanger',.95,.919,.27,.027,.10,.028,dark,.003)

panel,active=scene('Unit information panel',768,240,7.68);panel_root=active
box('Leather backing',0,0,.018,7.43,2.15,.075,leather,.035)
for y in [-1.035,1.035]:
    box('Oak rail',0,y,.10,7.54,.22,.18,wood,.035)
    box('Rail bevel light',0,y+math.copysign(.079,y),.19,7.43,.035,.024,woodlight,.005)
for x in [-3.67,3.67]:box('Oak side rail',x,0,.10,.24,2.20,.18,wood,.035)
for y in [-.875,.875]:
    box('Brass horizontal inlay',0,y,.197,7.10,.048,.035,brass,.005)
    box('Fine leather seam',0,y-math.copysign(.050,y),.077,6.96,.015,.009,dark,0)
for x in [-3.53,3.53]:
    box('Brass vertical inlay',x,0,.197,.048,1.79,.035,brass,.005)
    box('Fine leather seam',x-math.copysign(.05,x),0,.077,.015,1.67,.009,dark,0)
for x in [-3.60,3.60]:
    for y in [-.97,.97]:rivet(x,y,.20,.092)
for x,y,turn,size in [(-3.64,1.045,-.55,.18),(3.66,-1.026,.72,.19)]:foliage(x,y,.28,size,turn)
for x,y,seed in [(-3.50,1.042,41),(3.48,-1.045,32)]:moss_patch(x,y,.24,seed,.17)

# The authoring file holds both exact export scenes and a larger comparison view.
preview,active=scene('Unit frame design study',1600,600,10.0)
for source,x,y,scale in [(portrait_root,-3.65,0,1.0),(panel_root,1.22,0,1.0)]:
    group=bpy.data.objects.new(source.name+' preview',None);preview.collection.objects.link(group);group.location=(x,y,0);group.scale=(scale,scale,scale)
    for child in source.children:
        obj=child.copy();obj.data=child.data;preview.collection.objects.link(obj);obj.parent=group
backdrop=material('Preview forest backdrop','243F32',.92)
box('Preview-only backdrop',0,0,-.15,20,10,.1,backdrop,.0)
preview.render.film_transparent=False
OUT.mkdir(parents=True,exist_ok=True);SOURCE.parent.mkdir(parents=True,exist_ok=True)
portrait['pixel_contract']='256x256; centre128/128; fully clear portrait circle diameter170px; outer trim stays inside canvas.'
panel['pixel_contract']='768x240; safe text rectangle x44..724,y42..198; border-image slice36px; no baked text or bars.'
portrait.render.filepath=str(OUT/'unit-portrait-ring.png');panel.render.filepath=str(OUT/'unit-panel.png');preview.render.filepath=str(PREVIEW)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
for current,path in [(portrait,OUT/'unit-portrait-ring.png'),(panel,OUT/'unit-panel.png'),(preview,PREVIEW)]:
    bpy.context.window.scene=current;current.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    # Read the delivered PNG, not a colour-converted render-buffer assumption.
    png=bpy.data.images.load(str(path),check_existing=False);w,h=png.size;pixels=list(png.pixels)
    if current!=preview:
        assert [w,h]==([256,256] if current==portrait else [768,240])
        assert all(pixels[(y*w+x)*4+3]==0 for x,y in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)])
        assert all(pixels[(y*w+x)*4+3]==0 for x,y in [(x,y) for x in range(w) for y in [0,h-1]]+[(x,y) for x in [0,w-1] for y in range(h)]),'frame artwork never clips at the canvas edges'
        if current==portrait:
            assert all(pixels[(y*w+x)*4+3]==0 for x in range(256) for y in range(256) if (x-127.5)**2+(y-127.5)**2<85**2),'portrait centre is fully transparent'
        else:
            assert all(pixels[(y*w+x)*4+3]>.99 for x,y in [(44,42),(724,42),(44,198),(724,198),(384,120)]),'text area has a solid quiet backing'
    bpy.data.images.remove(png)
    print('UNIT_FRAME_PNG',path.name,w,h,path.stat().st_size)
print('UNIT_FRAME_CONTRACT ring=256x256,circleCenter=128/128,safeHoleDiameter=170;panel=768x240,safeContent=44/42/724/198,borderSlice=36')
