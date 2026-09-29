"""Render the party's 32-second adventure using the game's articulated actors.
Blender --background --python scripts/build-story-trailer.py
Add -- --previews to also render a contact sheet's inspection frames.
"""
import bpy
import importlib.util
import math
import random
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('cinematic', ROOT / 'scripts/build-trailer.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
OUT = ROOT / 'assets/trailer-story'
h.OUT = OUT
M = h.M
M['orange'] = h.mat('Ember magic', 'FF9D39', 7)
M['dust'] = h.mat('Soft earth fragments', 'AD9670')
random.seed(129)

# Import once, then share mesh data between independently animated shot copies.
source_scene = bpy.data.scenes.new('Actor library')
h.activate(source_scene)
for filename in ('actors.glb', 'monsters.glb'):
    bpy.ops.import_scene.gltf(filepath=str(OUT / filename))
SOURCES = {role: bpy.data.objects[('hero-' if role in ('ranger', 'knight', 'mage') else 'monster-') + role]
           for role in ('ranger', 'knight', 'mage', 'wolf', 'golem', 'boss')}


def actor(role, name, at, facing=math.pi):
    root = h.empty(name, at)
    root['actor_role'] = role
    root.rotation_euler.z = facing
    source = SOURCES[role]
    copied = {}
    for original in [source, *source.children_recursive]:
        node = original.copy()
        node.animation_data_clear()
        node.name = name + '/' + original.name
        node['source_node'] = original.name
        bpy.context.scene.collection.objects.link(node)
        copied[original] = node
    for original, node in copied.items():
        node.parent = copied.get(original.parent, root)
    return root, copied


def play(a, kind, start, end):
    role = a[0]['actor_role']
    action = bpy.data.actions[f'{role}-{kind}']
    length = 20 if role in ('ranger', 'knight', 'mage') and kind == 'run' else 48 if kind == 'idle' else 24
    for original, node in a[1].items():
        slot = action.slots.get('OB' + original.name)
        if not slot:
            continue
        track = node.animation_data_create().nla_tracks.new()
        track.name = f'{kind} {start}-{end}'
        strip = track.strips.new(track.name, start, action)
        strip.action_slot = slot
        strip.action_frame_start, strip.action_frame_end = 0, length
        strip.extrapolation = 'NOTHING'
        strip.blend_type = 'REPLACE'
        if kind == 'attack':
            strip.repeat, strip.scale = 1, (end - start) / length
        else:
            strip.repeat = (end - start) / length
        strip.frame_start, strip.frame_end = start, end


def linear(obj, paths=('location',)):
    ad = obj.animation_data
    if not ad or not ad.action:
        return
    for layer in ad.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    if curve.data_path in paths:
                        for point in curve.keyframe_points:
                            point.interpolation = 'LINEAR'


def path(a, points):
    root = a[0] if isinstance(a, tuple) else a
    for frame, at in points:
        h.key(root, 'location', at, frame)
    linear(root)


def turn(a, angle, frame):
    previous = a[0].rotation_euler.z
    angle = previous + (angle - previous + math.pi) % math.tau - math.pi
    h.key(a[0], 'rotation_euler', (0, 0, angle), frame)


def toward(a, at, target, frame):
    turn(a, math.atan2(target[0] - at[0], at[1] - target[1]), frame)


def marker(scene, name, frame):
    scene.timeline_markers.new(name, frame=frame)


def shot(name, duration, dark=False):
    scene = h.scene(name, duration, dark)
    scene.eevee.shadow_pool_size = '1024'
    scene.eevee.taa_render_samples = 24
    scene['story'] = name
    return scene


def woods(scene, village=False, night=False):
    h.forest()
    # The source combines the gateway with its stone material mesh; the combat
    # clearing needs that mesh removed so the chase stays physically unobstructed.
    if not village:
        for obj in list(scene.objects):
            if obj.name.startswith('creator-stone'):
                bpy.data.objects.remove(obj, do_unlink=True)
    if village:
        h.library('village-kit.blend', 'village-cottage', (-6, 4.8, 0), rotation=-.14)
        h.library('village-kit.blend', 'village-inn', (6.2, 6.8, 0), rotation=.16)
        h.library('village-kit.blend', 'village-stall', (-4.8, -2.3, 0), scale=.85)
    if night:
        scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .19
        for obj in scene.objects:
            if obj.type == 'LIGHT' and obj.data.type == 'SUN':
                obj.data.energy, obj.data.color = .42, (.45, .65, 1)
        h.light('AREA', 'Moonlit blue rim', (-5, 9, 12), 2600, (.25, .6, 1), 8, (0, 3, 2))
        h.light('AREA', 'Readable battle foreground', (5, -5, 8), 1700, (.68, .8, 1), 8, (0, 3, 2))
    else:
        h.light('AREA', 'Golden hero key', (4, -5, 8), 1600, (1, .84, .59), 8, (0, 3, 1.5))


def tracking(scene, positions, lens=36):
    first, last = positions[0], positions[-1]
    cam = h.camera(scene, first[1], last[1], first[2], last[2], lens)
    cam.data.dof.aperture_fstop = 9
    for frame, at, look in positions:
        h.key(cam, 'location', at, frame)
        h.aim(cam, look)
        cam.keyframe_insert(data_path='rotation_euler', frame=frame)
        h.key(cam.data.dof.focus_object, 'location', look, frame)
    return cam


def glow_cube(name, at, size, material):
    obj = h.cube(name, at, (size,) * 3, material, .018)
    obj.rotation_euler = (.55, .25, .7)
    return obj


def impact(scene, name, at, frame, material=M['gold'], count=28):
    marker(scene, name, frame)
    h.burst(scene, at, frame, count, material)
    core = glow_cube(name + ' flash', at, .48, material)
    h.pulse(core, frame - 1, frame + 1, frame + 6, 1.7)
    wave = h.ring(name + ' ground ripple', (at[0], at[1], .10), 1, material, .028)
    h.pulse(wave, frame - 1, frame + 8, frame + 18, 1.7)


def projectile(scene, name, start, end, launch, hit, material, arrow=False, caster=None):
    if caster:
        scene.frame_set(launch)
        bpy.context.view_layer.update()
        source_node = 'ranger-bow-nocked-arrow-1' if arrow else 'mage-staff-voxel-7'
        tip = next(node for node in caster[1].values() if node.get('source_node') == source_node)
        start = tuple(tip.evaluated_get(bpy.context.evaluated_depsgraph_get()).matrix_world.translation)
    marker(scene, name + '-release', launch)
    marker(scene, name + '-hit', hit)
    root = h.empty(name, start)
    root['projectile'] = True
    root['launch'], root['hit'] = launch, hit
    root['target'] = list(end)
    core = h.cube(name + ' core', (0, 0, 0), (.045, .7, .045) if arrow else (.28,) * 3, material, .006)
    core.parent, core.location = root, (0, 0, 0)
    root.rotation_euler = (Vector(end) - Vector(start)).to_track_quat('Y', 'Z').to_euler()
    path(root, [(launch, start), (hit, end)])
    for frame, size in [(1, .0001), (launch - 1, .0001), (launch, 1), (hit, 1), (hit + 1, .0001)]:
        h.key(root, 'scale', (size,) * 3, frame)
    linear(root, ('scale',))
    trail = h.line(name + ' luminous trail', [start, end], material, .015 if arrow else .042)
    for frame, value in [(1, 0), (launch, 0), (hit, 1)]:
        h.key(trail.data, 'bevel_factor_end', value, frame)
    for frame, hide in [(1, True), (launch, False), (hit + 4, True)]:
        h.key(trail, 'hide_render', hide, frame)
    impact(scene, name + '-impact', end, hit, material)
    return root


def defeat(scene, a, at, hit, gone, material=M['gold']):
    root = a[0]
    root['defeat_frame'] = hit
    marker(scene, root.name + '-defeated', hit)
    # Whole-character stumble and disintegration complements the joint animations.
    path(a, [(hit - 1, at), (hit + 5, (at[0], at[1] + .55, .15)),
             (gone, (at[0] + .35, at[1] + .8, -.2))])
    angle = root.rotation_euler.z
    for f, rot in [(hit - 1, (0, 0, angle)), (hit + 10, (.15, 0.7, angle)), (gone, (.3, 1.45, angle))]:
        h.key(root, 'rotation_euler', rot, f)
    for f, size in [(1, 1), (gone - 7, 1), (gone, .001)]:
        h.key(root, 'scale', (size,) * 3, f)
    h.burst(scene, (at[0], at[1], 1.1), hit + 3, 36, material)


def slash(scene, center, frame):
    points = [(center[0] + .92 * math.cos(t), center[1], center[2] + .92 * math.sin(t))
              for t in [i * math.pi / 28 - .3 for i in range(30)]]
    arc = h.line('Sword sweep', points, M['gold'], .045)
    for f, hidden in [(1, True), (frame - 3, False), (frame + 4, True)]:
        h.key(arc, 'hide_render', hidden, f)
    impact(scene, 'sword-contact', center, frame, M['gold'], 20)


# One uninterrupted camera move through a running battle. All action occupies the
# same world, with continuous actor paths between enemies and no editorial cuts.
s = shot('01-continuous-battle', 768)
woods(s)
for obj in list(s.objects):
    if not obj.name.startswith('creator-') or obj.type != 'MESH':
        continue
    if any(token in obj.name for token in ('lantern', 'old-gold')):
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    if any(token in obj.name for token in ('leaf', 'trunk', 'bark', 'ground-moss')):
        # Every source voxel is a disconnected eight-vertex cube. Remove the
        # central distant-tree voxels where the boss arena now occupies the road.
        mesh = obj.data
        removed = set()
        voxel_vertices = list(mesh.vertices)
        for i in range(0, len(voxel_vertices), 8):
            group = voxel_vertices[i:i + 8]
            center = sum((v.co for v in group), Vector()) / len(group)
            if (abs(center.x) < 4 and 24 < center.y < 35) or (abs(center.x) < 3.3 and 4.8 < center.y < 7.2 and center.z > 2):
                removed.update(v.index for v in group)
        if removed:
            vertices, indices = [], {}
            for v in mesh.vertices:
                if v.index not in removed:
                    indices[v.index] = len(vertices)
                    vertices.append(tuple(v.co))
            faces = [[indices[i] for i in face.vertices] for face in mesh.polygons if not any(i in removed for i in face.vertices)]
            materials = list(mesh.materials)
            clean = bpy.data.meshes.new(mesh.name + ' arena clearing')
            clean.from_pydata(vertices, [], faces)
            for material in materials:
                clean.materials.append(material)
            obj.data = clean
        if any(token in obj.name for token in ('leaf', 'trunk', 'bark')):
            for v in obj.data.vertices:
                if v.co.x > 0:
                    v.co.x += 4.0
    obj.scale.x = 1.7

# Ancient stones gradually replace the forest road while the camera keeps moving.
for row in range(14, 40):
    for col in range(-3, 4):
        if row < 17 and random.random() < .4:
            continue
        h.cube('Rootvault paving', (col * 1.05, row, -.035), (1, .94, .08), M['stone'] if (row+col) % 7 else M['path'])
for side in (-1, 1):
    for y in [16, 23, 34, 39]:
        h.library('rootvault-kit.blend', 'rootvault-pillar', (side * 10.0, y, 0))
    for y in [19, 32]:
        h.library('rootvault-kit.blend', 'rootvault-brazier', (side * 7.4, y, 0), scale=.7)
        h.light('POINT', 'Rootvault amber flame', (side * 7.4, y, 1.9), 120, (1, .43, .16), .6)
h.light('AREA', 'Ancient blue canopy light', (-3, 28, 12), 2200, (.23, .62, 1), 12, (0, 30, 1.5))
h.light('AREA', 'Boss face key', (5, 24, 9), 2300, (.68, .8, 1), 10, (0, 31, 3))
# The weather changes continuously as the party reaches Stormhorn.
for obj in s.objects:
    if obj.type == 'LIGHT' and obj.data.type == 'SUN':
        for f, energy, tint in [(1, 1.5, (1, .83, .57)), (320, 1.5, (1, .83, .57)), (445, .48, (.48, .68, 1)), (715, .48, (.48, .68, 1)), (768, 1.1, (1, .83, .57))]:
            h.key(obj.data, 'energy', energy, f)
            h.key(obj.data, 'color', tint, f)

k = actor('knight', 'party-knight', (-.35, -2, 0))
r = actor('ranger', 'party-ranger', (-1.8, -3.2, 0))
m = actor('mage', 'party-mage', (1.35, -3.8, 0))
# Each hero's authored route stays continuous throughout the single scene.
path(k, [(1, (-.35,-2,0)), (45,(-.35,1.4,0)), (72,(-.35,1.4,0)), (109,(-.35,2.5,0)),
         (169,(.4,8.1,0)), (193,(.4,8.1,0)), (253,(.9,15.3,0)), (300,(.9,15.3,0)),
         (325,(1.7,17.3,0)), (349,(1.7,17.3,0)), (445,(-.35,26,0)), (481,(-.35,26,0)),
         (505,(-3.4,23.5,.55)), (519,(-3.5,23.4,0)), (561,(-.5,28.9,0)),
         (589,(-.5,28.9,0)), (608,(1.9,26.8,0)), (660,(1.9,26.8,0)),
         (685,(.4,27.5,0)), (714,(.4,27.5,0)), (746,(0,29.5,0)), (768,(0,29.5,0))])
path(r, [(1,(-1.8,-3.2,0)), (45,(-1.8,-.1,0)), (109,(-1.8,-.1,0)), (157,(-1.9,5.4,0)),
         (217,(-1.9,9.5,0)), (253,(-1.8,13.5,0)), (309,(-1.8,13.5,0)), (349,(-1.8,16,0)),
         (445,(-2,24.5,0)), (481,(-2,24.5,0)), (505,(-4.6,22.7,.5)), (519,(-4.5,22.8,0)),
         (561,(-3.2,25,0)), (620,(-3.2,25,0)), (645,(-2.8,25.5,0)), (709,(-2.8,25.5,0)),
         (751,(-1.6,28.5,0)), (768,(-1.6,28.5,0))])
path(m, [(1,(1.35,-3.8,0)), (45,(1.35,-.8,0)), (109,(1.35,-.8,0)), (181,(1.3,7.4,0)),
         (221,(1.3,7.4,0)), (253,(-.2,14.7,0)), (309,(-.2,14.7,0)), (349,(.3,16,0)),
         (445,(1.6,24,0)), (481,(1.6,24,0)), (505,(4.5,22.6,.55)), (519,(4.4,22.7,0)),
         (573,(2.6,25.3,0)), (645,(2.6,25.3,0)), (665,(3.1,25.8,0)), (709,(3.1,25.8,0)),
         (751,(1.6,28.5,0)), (768,(1.6,28.5,0))])
for a, schedule in [(k,[('run',1,49),('attack',49,73),('run',73,169),('attack',169,193),('run',193,253),('idle',253,301),('run',301,325),('attack',325,349),('run',349,445),('idle',445,481),('run',481,565),('attack',565,589),('run',589,609),('idle',609,660),('run',660,686),('idle',686,714),('run',714,746),('idle',746,769)]),
                    (r,[('run',1,45),('idle',45,85),('attack',85,109),('run',109,253),('idle',253,309),('run',309,445),('idle',445,481),('run',481,561),('idle',561,620),('run',620,645),('idle',645,661),('attack',661,685),('idle',685,709),('run',709,751),('idle',751,769)]),
                    (m,[('run',1,45),('idle',45,109),('run',109,193),('attack',193,217),('run',217,253),('idle',253,265),('attack',265,289),('idle',289,309),('run',309,445),('idle',445,481),('run',481,573),('idle',573,607),('attack',607,631),('idle',631,645),('run',645,665),('idle',665,709),('run',709,751),('idle',751,769)])]:
    for kind, start, end in schedule:
        play(a, kind, start, end)
# Monsters enter from different directions; party members turn to address threats.
for a, poses in [(k,[(1,math.pi),(157,math.pi),(169,math.pi),(300,math.pi),(325,math.pi),(445,math.pi)]),
                 (r,[(1,math.pi),(67,2.193),(85,2.193),(109,2.193),(125,math.pi),(445,math.pi)]),
                 (m,[(1,math.pi),(181,math.pi),(193,math.pi+.77),(221,math.pi),(445,math.pi)])]:
    for frame, angle in poses:
        turn(a, angle, frame)

w1 = actor('wolf', 'wolf-first', (-.3, 7.0, 0), 0)
w2 = actor('wolf', 'wolf-flanker', (5.5, 5.8, 0), -.831)
path(w1, [(1,(-.3,7,0)), (43,(-.3,3.45,0)), (60,(-.3,3.45,0))])
path(w2, [(1,(5.5,5.8,0)), (65,(2.1,2.7,0)), (96,(2.1,2.7,0))])
play(w1,'run',1,41); play(w1,'attack',41,65)
play(w2,'run',1,73); play(w2,'attack',73,97)
turn(w2,-.831,1);turn(w2,-.831,60);turn(w2,-.95,73)
slash(s,(-.3,2.6,1.45),61)
defeat(s,w1,(-.3,3.45,0),61,85)
projectile(s,'wolf-arrow',(-1.5,.4,1.7),(2.1,2.7,1.15),91,97,M['gold'],True,caster=r)
defeat(s,w2,(2.1,2.7,0),97,121)

w3 = actor('wolf','wolf-road-block',(2.8,15.0,0),-.464)
w4 = actor('wolf','wolf-pursuer',(-5.8,12.8,0),1.033)
path(w3,[(1,(2.8,15,0)),(109,(2.8,15,0)),(161,(.4,10.2,0)),(180,(.4,10.2,0))])
path(w4,[(1,(-5.8,12.8,0)),(133,(-5.8,12.8,0)),(193,(-1.1,10,0)),(216,(-1.1,10,0))])
play(w3,'idle',1,109); play(w3,'run',109,157); play(w3,'attack',157,181)
play(w4,'idle',1,133); play(w4,'run',133,193); play(w4,'attack',193,217)
turn(w3,-.464,1);turn(w3,-.464,140);turn(w3,0,157)
turn(w4,1.033,1);turn(w4,1.033,180);turn(w4,.745,193)
slash(s,(.4,9.3,1.45),181)
defeat(s,w3,(.4,10.2,0),181,205)
projectile(s,'chase-magic',(1.0,8.0,2.35),(-1.1,10,1.2),201,217,M['violet'],caster=m)
defeat(s,w4,(-1.1,10,0),217,241,M['violet'])

g1=actor('golem','golem-gatekeeper',(-.2,22.5,0),0)
g2=actor('golem','golem-flanker',(4.9,22,0),-.818)
path(g1,[(1,(-.2,22.5,0)),(217,(-.2,22.5,0)),(265,(-.2,18,0)),(288,(-.2,18,0))])
path(g2,[(1,(4.9,22,0)),(253,(4.9,22,0)),(313,(1.7,19,0)),(336,(1.7,19,0))])
play(g1,'idle',1,217);play(g1,'run',217,265);play(g1,'attack',265,289)
play(g2,'idle',1,253);play(g2,'run',253,313);play(g2,'attack',313,337)
turn(g2,-.818,1);turn(g2,-.818,295);turn(g2,0,313)
projectile(s,'golem-fireball',(-.15,15.25,2.5),(-.2,18,1.75),273,289,M['orange'],caster=m)
charge=h.ring('Mage charging ground rune',(-.2,14.7,.1),.7,M['violet'],.03)
h.pulse(charge,260,273,290,1.4)
defeat(s,g1,(-.2,18,0),289,313,M['orange'])
slash(s,(1.7,18.2,1.65),337)
defeat(s,g2,(1.7,19,0),337,361)

b=actor('boss','battle-stormhorn',(0,36,0),0)
play(b,'idle',1,373);play(b,'run',373,445);play(b,'idle',445,481);play(b,'attack',481,529);play(b,'idle',529,709)
path(b,[(1,(0,36,0)),(373,(0,36,0)),(445,(0,31.4,0)),(576,(0,31.4,0)),
        (580,(0,31.7,0)),(600,(0,31.4,0)),(625,(0,31.7,0)),(645,(0,31.4,0)),
        (673,(0,31.9,0)),(708,(0,31.7,0))])
for a, at, dodge in [(k,(-.5,28.9),(-3.4,23.5)),(r,(-3.2,25),(-4.6,22.7)),(m,(2.6,25.3),(4.5,22.6))]:
    turn(a,math.pi,475)
    toward(a,(0,25),dodge,486)
    toward(a,at,(0,31.4),553)
    toward(a,at,(0,31.4),707)
    turn(a,math.pi,740)
marker(s,'party-dodge',505)
marker(s,'boss-impact',505)
for offset in [0,8,16]:
    wave=h.ring('Expanding thunder shockwave',(0,29.8,.16),1,M['cyan'],.045)
    for f,size in [(1,.001),(504+offset,.001),(508+offset,1),(528+offset,6.4),(538+offset,7.5)]:
        h.key(wave,'scale',(size,size,1),f)
    for f,hidden in [(1,True),(505+offset,False),(539+offset,True)]:
        h.key(wave,'hide_render',hidden,f)
for i in range(7):
    start=Vector((-.8 if i%2 else .8,30.8,6.2))
    end=Vector(((i-3)*.7,29+(i%2)*.4,.1))
    points=[tuple(start)]+[tuple(start.lerp(end,j/6)+Vector((random.uniform(-.2,.2),random.uniform(-.15,.15),0))) for j in range(1,7)]
    bolt=h.line('Forked storm lightning',points,M['white'],.024)
    for f,hidden in [(1,True),(495+i,False),(500+i,True),(504+i,False),(511+i,True)]:
        h.key(bolt,'hide_render',hidden,f)
h.burst(s,(0,29.8,.3),505,65,M['cyan'])
flash=h.light('POINT','Thunder impact flash',(0,29.5,3.4),1,(.3,.75,1),1.4)
for f,energy in [(1,1),(503,1),(505,1800),(512,100),(522,1)]:
    h.key(flash.data,'energy',energy,f)
slash(s,(.4,30.0,1.2),577)
projectile(s,'boss-mage-bolt',(2.3,25.9,2.5),(.5,30.1,2.6),615,625,M['violet'],caster=m)
projectile(s,'boss-arrow',(-2.5,26.0,1.7),(-.2,30,2.4),667,673,M['gold'],True,caster=r)
impact(s,'boss-final-break',(0,31.6,3),709,M['gold'],70)
defeat(s,b,(0,31.7,0),709,733,M['cyan'])
crystal=glow_cube('Recovered golden crystal',(0,35,5.7),.32,M['gold'])
path(crystal,[(1,(0,35,5.7)),(373,(0,35,5.7)),(445,(0,30.4,5.7)),(705,(0,30.4,5.7)),(733,(0,30,2.8)),(751,(0,29.5,2.7)),(768,(0,29.5,2.7))])
for f in range(1,770,48):
    h.key(crystal,'rotation_euler',(.5,f/61,f/25),f)
marker(s,'crystal-recovered',733)

cam=tracking(s,[(1,(8.5,-11,6.8),(0,1,1.4)),(61,(8,-8,6.2),(0,2,1.4)),
                (109,(8,-7,6.2),(0,3.5,1.5)),(181,(8.5,-.5,6.8),(0,9,1.5)),
                (241,(8.5,4.5,6.8),(0,14.5,1.65)),(289,(8.5,7,6.5),(0,17,1.65)),
                (349,(8.5,9.5,6.8),(0,20,1.75)),(421,(8.5,11,7.6),(0,26.5,2.8)),
                (481,(9,12,8),(0,28,2.8)),(545,(9,12,8),(0,27.5,2.5)),
                (625,(8.7,16.4,7.8),(0,28.5,2.6)),(709,(8.0,16,7.2),(0,29.7,2.5)),
                (768,(6.7,20.3,5.7),(0,29.6,1.85))],36)
cam.data.dof.use_dof=False
for f, lens in [(1,34),(349,34),(421,29),(709,29),(751,32),(768,32)]:
    h.key(cam.data,'lens',lens,f)
h.motes(s,90,(-7,-1,.3),(7,43,6),M['gold'],.027)

# The title overlays the still-running shot, never replaces it with a new scene.
bpy.ops.mesh.primitive_plane_add(size=2)
logo=bpy.context.object
logo.name='Approved Mossvale wordmark'
logo.parent,logo.location=cam,(0,.25,-5)
logo.visible_shadow=False
for f,scale in [(1,.001),(733,.001),(745,2.04),(760,2.0),(768,2.0)]:
    h.key(logo,'scale',(scale,scale/3,1),f)
ink=bpy.data.materials.new('Approved transparent wordmark')
ink.use_nodes=True
nodes,links=ink.node_tree.nodes,ink.node_tree.links
nodes.clear()
texture=nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(str(ROOT/'public/ui/wordmark.png'))
emission=nodes.new('ShaderNodeEmission');emission.inputs['Strength'].default_value=1.15
transparent=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader');output=nodes.new('ShaderNodeOutputMaterial')
links.new(texture.outputs['Color'],emission.inputs['Color']);links.new(texture.outputs['Alpha'],mix.inputs[0])
links.new(transparent.outputs[0],mix.inputs[1]);links.new(emission.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs['Surface'])
logo.data.materials.append(ink)
marker(s,'wordmark-reveal',735)

assert s.frame_end==768 and len([o for o in s.objects if o.get('actor_role') in ('ranger','mage','knight')])==3
for obj in s.objects:
    if obj.get('projectile'):
        assert obj['launch']<obj['hit']<=s.frame_end
s.frame_set(1)
h.activate(s)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mossvale-story-trailer.blend'),compress=True)
print('CONTINUOUS_BATTLE_READY: one shot, 768 frames, running combat, no cuts',flush=True)
if '--previews' in sys.argv:
    s.render.resolution_percentage=50
    old_path=s.render.filepath
    for f in [97,289,505,577,751]:
        s.frame_set(f)
        s.render.filepath=str(OUT/f'continuous-{f:03d}-preview.png')
        bpy.ops.render.render(write_still=True)
    s.render.filepath=old_path
    print('CONTINUOUS_PREVIEWS_READY',flush=True)
