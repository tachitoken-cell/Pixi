"""Mossvale's Amber and Frost story beacons, in metres, Y up, +Z front.
Blender --background --python scripts/build-beacon-assets.py -- --render
Two roots, two meshes each. The game controls the separate light mesh.
"""
import bpy
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/beacon-kit.blend'
EXPORT = ROOT / 'public/models/beacon-kit.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
library = bpy.context.scene
library.name = 'Beacon library - game origins'
library.unit_settings.system = 'METRIC'

def xyz(x, y, z): return x, -z, y
def linear(v): return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
def color(h): return tuple(linear(int(h[i:i+2], 16) / 255) for i in (0, 2, 4)) + (1,)

materials = {}
for role in ['frame', 'light']:
    mat = bpy.data.materials.new('Beacon ' + role + ' vertex palette')
    mat.use_nodes = True
    shader = mat.node_tree.nodes['Principled BSDF']
    shader.inputs['Roughness'].default_value = .72 if role == 'frame' else .28
    tint = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    tint.layer_name = 'BeaconTint'
    mat.node_tree.links.new(tint.outputs['Color'], shader.inputs['Base Color'])
    if role == 'light':
        # Direct color output exports as KHR_materials_unlit, retaining vertex tint.
        mat.node_tree.links.new(tint.outputs['Color'], mat.node_tree.nodes['Material Output'].inputs['Surface'])
        mat.node_tree.nodes.remove(shader)
    materials[role] = mat

parts = {}
palette = {}
def mesh(tint, vertices, faces, role='frame'):
    volume = sum(Vector(vertices[f[0]]).dot(Vector(vertices[f[i]]).cross(Vector(vertices[f[i+1]])))
                 for f in faces for i in range(1,len(f)-1)) / 6
    assert volume > 1e-10, (tint, 'closed primitives must face outward', volume)
    data = parts.setdefault(role, {'vertices': [], 'faces': [], 'colors': []})
    start = len(data['vertices'])
    data['vertices'].extend(xyz(*v) for v in vertices)
    data['faces'].extend(tuple(start + i for i in face) for face in faces)
    data['colors'].extend([color(palette[tint])] * len(faces))

FACES = [(0,3,2,1), (4,5,6,7), (0,1,5,4), (3,7,6,2), (0,4,7,3), (1,2,6,5)]
def box(tint, x, y, z, w, h, d, role='frame'):
    mesh(tint, [(x+a*w/2, y+b*h/2, z+c*d/2) for a,b,c in
               [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]], FACES, role)

def beam(tint, a, b, width, depth=None, role='frame'):
    a, b = Vector(a), Vector(b)
    along = (b-a).normalized()
    u = along.cross(Vector((0,0,1)))
    if u.length < .01: u = along.cross(Vector((0,1,0)))
    u.normalize()
    v = along.cross(u).normalized()
    depth = depth or width
    mesh(tint, [tuple(p+u*i*width/2+v*j*depth/2) for p in [a,b]
                for i,j in [(-1,-1),(1,-1),(1,1),(-1,1)]], FACES, role)

def dressed(tint, x, y, z, w, h, d, cut=.04):
    # Chamfered stone edges are actual geometry, with broad flat voxel faces.
    ring = [(-w/2+cut,-d/2),(w/2-cut,-d/2),(w/2,-d/2+cut),(w/2,d/2-cut),
            (w/2-cut,d/2),(-w/2+cut,d/2),(-w/2,d/2-cut),(-w/2,-d/2+cut)]
    vertices = [(x+a,y+b*h/2,z+c) for b in [-1,1] for a,c in ring]
    mesh(tint, vertices, [tuple(range(8)),tuple(reversed(range(8,16)))] +
         [(i+8,(i+1)%8+8,(i+1)%8,i) for i in range(8)])

def crystal(tint, x, y, z, w, h, role='frame'):
    ring = [(x+math.sin(i*math.tau/6)*w/2, y-h*.18, z+math.cos(i*math.tau/6)*w/2) for i in range(6)]
    ring += [(x+math.sin(i*math.tau/6)*w*.43, y+h*.22, z+math.cos(i*math.tau/6)*w*.43) for i in range(6)]
    vertices = ring + [(x,y-h/2,z),(x,y+h/2,z)]
    mesh(tint, vertices, [(12,(i+1)%6,i) for i in range(6)] +
         [(i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6)] +
         [(13,i+6,(i+1)%6+6) for i in range(6)], role)

def crest(y, z, frost):
    if frost:
        for a in [0, math.pi/3, -math.pi/3]:
            dx,dy=math.sin(a)*.19,math.cos(a)*.19
            beam('metal',(-dx,y-dy,z),(dx,y+dy,z),.035,.025)
    else:
        points=[(0,y-.20,z),(-.14,y-.02,z),(0,y+.23,z),(.14,y-.02,z),(0,y-.20,z)]
        for a,b in zip(points,points[1:]): beam('metal',a,b,.035,.025)
    crystal('light',0,y,z+.025,.075,.16,'light')

roots = {}
for zone, frost in [('amberwild',False),('frostmarch',True)]:
    parts = {}
    palette = ({'stone':'8FABB5','pale':'CEE0DE','shade':'54737F','joint':'324E5A',
                'metal':'BDCDD2','edge':'EFF4DF','darkmetal':'526D80','dormant':'48637A',
                'light':'A3EDFF','core':'E6FCFF','growth':'E0EEEB'} if frost else
               {'stone':'AA9870','pale':'D8C697','shade':'7D7453','joint':'494D3D',
                'metal':'C49346','edge':'F0D293','darkmetal':'715B36','dormant':'715F42',
                'light':'FFD16C','core':'FFF1C1','growth':'667F4A'})
    for side in [-1,1]:
        x=side*1.0
        # Below head height, every solid stays inside the existing r=.20 post collider.
        dressed('shade',x,.09,0,.28,.18,.28,.055)
        dressed('pale',x,.205,0,.27,.05,.27,.05)
        box('joint',x,1.71,0,.22,2.97,.22)
        for row in range(9):
            y=.39+row*.315
            dressed('pale' if row%4==0 else 'stone',x,y,0,.265,.292,.265,.035)
            if row in [1,5,8]:
                box('darkmetal',x,y-.08,.134,.20,.036,.015)
                box('metal',x,y-.074,.145,.16,.018,.012)
        for zsign in [-1,1]:
            # Recessed inscription strips and tiny bronze pegs repeat front and back.
            box('joint',x,1.62,zsign*.134,.085,.79,.012)
            for yy in [1.35,1.60,1.84]:
                beam('metal',(x-.026,yy-.035,zsign*.145),(x+.026,yy+.035,zsign*.145),.019,.012)
                box('light',x,yy,zsign*.154,.023,.049,.009,'light')
        for yy,w,h in [(3.12,.34,.14),(3.25,.42,.13),(3.36,.49,.08)]:
            dressed('pale' if yy!=3.25 else 'shade',x,yy,0,w,h,.39,.04)
        for z in [-.19,.19]:
            beam('darkmetal',(x,2.78,z),(side*.66,3.44,z),.10,.09)
            beam('metal',(x,2.82,z+.012),(side*.66,3.45,z+.012),.046,.095)
        # Small lichen or snow patches remain tight to the posts.
        for i in range(4): box('growth',x+side*.02,.30+i*.07,.12,.12-i*.02,.046,.035)

    dressed('shade',0,3.48,0,2.5,.19,.58,.065)
    dressed('pale',0,3.61,0,2.56,.09,.62,.055)
    box('darkmetal',0,3.725,0,2.14,.16,.45)
    for z in [-.241,.241]:
        box('metal',0,3.715,z,2.03,.045,.03)
        for x in [-.86,-.57,.57,.86]:box('edge',x,3.74,z,.044,.044,.033)
    dressed('stone',0,3.865,0,1.76,.13,.50,.04)
    for side in [-1,1]:
        beam('metal',(side*.82,3.94,0),(side*.46,4.12,0),.08,.10)
        beam('edge',(side*.46,4.12,0),(side*.36,4.36,0),.06,.075)
        if frost:
            crystal('pale',side*.94,3.02,.12,.10,.38)
            crystal('pale',side*.62,3.30,-.12,.08,.23)
        else:
            beam('metal',(side*.58,4.04,0),(side*.78,4.27,0),.06,.075)
            beam('metal',(side*.76,4.26,0),(side*.92,4.32,0),.045,.065)
    dressed('darkmetal',0,3.91,.025,.48,.57,.39,.065)
    for z in [-.187,.247]:crest(3.95,z,frost)
    crystal('dormant',0,4.47,0,.18,.31)
    crystal('light',0,4.47,0,.187,.318,'light')
    # A suspended lantern leaves the approach open. Lit facets cover the dormant gem.
    for z in [-.23,.23]:
        beam('darkmetal',(0,3.42,z),(0,3.17,z),.034,.034)
        for side in [-1,1]:
            beam('metal',(0,3.18,z),(side*.37,2.87,z),.043,.05)
            beam('metal',(side*.37,2.87,z),(side*.23,2.37,z),.043,.05)
            beam('edge',(side*.23,2.37,z),(0,2.25,z),.05,.055)
    dressed('metal',0,2.235,0,.32,.09,.50,.045)
    crystal('dormant',0,2.77,0,.50,.99)
    crystal('light',0,2.77,0,.508,1.002,'light')
    crystal('core',-.05,2.80,.229,.095,.65,'light')
    for x,y,z in [(-.50,2.68,.03),(.45,3.04,-.04),(.22,2.03,.05)]:
        crystal('light',x,y,z,.08,.15,'light')

    parent=bpy.data.objects.new('beacon-'+zone,None)
    library.collection.objects.link(parent)
    parent['contract']='Metres; Y0 ground; +Z front; post colliders at X +/-1, Z0, radius .20'
    for role,data in parts.items():
        geo=bpy.data.meshes.new(parent.name+'-'+role)
        geo.from_pydata(data['vertices'],[],data['faces'])
        geo.materials.append(materials[role]);geo.update()
        tint=geo.color_attributes.new(name='BeaconTint',type='BYTE_COLOR',domain='CORNER')
        for face,col in zip(geo.polygons,data['colors']):
            for index in face.loop_indices:tint.data[index].color=col
        obj=bpy.data.objects.new(geo.name,geo);library.collection.objects.link(obj)
        obj.parent=parent;obj['part']=role
        assert all(math.isfinite(v) for vertex in data['vertices'] for v in vertex)
        if role=='frame':
            for x,z,y in data['vertices']:
                if y<2.1:assert min(math.hypot(x-side,z) for side in [-1,1])<=.201
    roots[zone]=parent

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,
    export_yup=True,export_apply=True,export_animations=False,export_cameras=False,
    export_lights=False,export_extras=True)

def aim(obj,at):obj.rotation_euler=(Vector(xyz(*at))-obj.location).to_track_quat('-Z','Y').to_euler()
galleries=[]
for lit in [True,False]:
    gallery=bpy.data.scenes.new('Beacons - '+('rekindled' if lit else 'dormant'))
    bpy.context.window.scene=gallery;galleries.append(gallery)
    for zone,x in [('amberwild',-2.1),('frostmarch',2.1)]:
        parent=roots[zone].copy();gallery.collection.objects.link(parent);parent.location=xyz(x,0,0)
        for child in roots[zone].children:
            obj=child.copy();gallery.collection.objects.link(obj);obj.parent=parent
            if child.get('part')=='light':obj.hide_render=not lit;obj.hide_viewport=not lit
        if lit:
            bpy.ops.object.light_add(type='POINT',location=xyz(x,2.75,.35))
            light=bpy.context.object;light.data.energy=22;light.data.shadow_soft_size=.6
            light.data.color=(.95,.48,.12) if zone=='amberwild' else (.27,.75,1)
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012))
    floor=bpy.context.object;floor.name='Review floor - not exported'
    mat=bpy.data.materials.get('Review slate') or bpy.data.materials.new('Review slate')
    mat.diffuse_color=(.035,.053,.049,1);floor.data.materials.append(mat)
    bpy.ops.object.camera_add(location=xyz(5.8,5.0,17.5))
    camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=10.0
    aim(camera,(0,2.2,0));gallery.camera=camera
    for at,power,size,col in [((-4,8,7),1250,7,(1,.88,.69)),((6,6,1),1050,6,(.67,.84,1)),((0,7,-5),1450,5,(.71,.86,.81))]:
        bpy.ops.object.light_add(type='AREA',location=xyz(*at))
        light=bpy.context.object;light.data.energy=power;light.data.size=size;light.data.color=col;aim(light,(0,2,0))
    gallery.world=bpy.data.worlds.new(gallery.name);gallery.world.use_nodes=True
    bg=gallery.world.node_tree.nodes['Background'];bg.inputs['Color'].default_value=(.12,.17,.16,1);bg.inputs['Strength'].default_value=.45
    gallery.render.engine='CYCLES';gallery.cycles.samples=32;gallery.cycles.use_denoising=True
    gallery.render.resolution_x=1600;gallery.render.resolution_y=1100;gallery.render.resolution_percentage=100
    gallery.render.image_settings.file_format='PNG';gallery.view_settings.view_transform='AgX'
    gallery.render.filepath=str(ROOT/('assets/source/beacon-kit-'+('lit' if lit else 'unlit')+'.png'))
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA'
                area.spaces.active.shading.type='MATERIAL'
                area.spaces.active.overlay.show_overlays=False
bpy.context.window.scene=galleries[0]
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
print('BEACONS: two roots, four vertex-colored meshes, '+str(EXPORT.stat().st_size)+' bytes',flush=True)
if '--render' in sys.argv:
    for gallery in galleries:
        bpy.context.window.scene=gallery;bpy.ops.render.render(write_still=True)
