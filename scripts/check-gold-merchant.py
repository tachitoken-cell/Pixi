"""Run with python3 scripts/check-gold-merchant.py; requires local Blender.

Opens the editable source, then imports the GLB into an empty Blender scene.
Checks asset content and world geometry; writes one compact validation report.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/gold-merchant-caravan.blend'
EXPORT = ROOT / 'public/models/gold-merchant-caravan.glb'
REPORT = ROOT / 'assets/gold-merchant/validation.json'
ACTORS = ['merchant', 'guard-captain', 'guard-spear', 'guard-crossbow']
HORSES = ['draft-horse-chestnut', 'draft-horse-dapple']


def check():
    import bpy
    from mathutils import Vector

    def tree(obj):
        yield obj
        for child in obj.children:
            yield from tree(child)

    def geometry(root):
        meshes = [obj for obj in tree(root) if obj.type == 'MESH']
        points = [obj.matrix_world @ vertex.co for obj in meshes for vertex in obj.data.vertices]
        assert points, f'{root.name}: no geometry'
        assert all(math.isfinite(n) for point in points for n in point), f'{root.name}: non-finite vertex'
        low = [min(point[i] for point in points) for i in range(3)]
        high = [max(point[i] for point in points) for i in range(3)]
        size = [b-a for a,b in zip(low,high)]
        assert all(.01 < n < 30 for n in size), f'{root.name}: implausible bounds {size}'
        return {'minimum': low, 'maximum': high, 'size': size,
                'mesh_count': len(meshes),
                'triangles': sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in meshes)}

    def snapshot():
        bpy.context.view_layer.update()
        result = {}
        for name in ['gold-merchant-caravan', 'secured-carriage'] + ACTORS + HORSES:
            matches = [obj for obj in bpy.context.scene.objects if obj.name == name]
            assert len(matches) == 1, f'Expected exactly one {name}, found {len(matches)}'
            result[name] = geometry(matches[0])
        return result

    assert SOURCE.is_file() and EXPORT.is_file(), 'Build the source and GLB first'
    raw = EXPORT.read_bytes()
    magic, version, length = struct.unpack_from('<III',raw)
    assert (magic,version,length) == (0x46546C67,2,len(raw)), 'Invalid GLB header'
    chunk_length, chunk_type = struct.unpack_from('<II',raw,12)
    assert chunk_type == 0x4E4F534A, 'First GLB chunk must be JSON'
    document = json.loads(raw[20:20+chunk_length])
    assert not document.get('cameras'), 'Camera leaked into GLB'
    assert not document.get('extensions',{}).get('KHR_lights_punctual'), 'Light leaked into GLB'
    assert not document.get('animations'), 'Unexpected animation clips'
    assert not document.get('images'), 'Vertex-color asset should not require image files'
    assert len(raw) < 5_000_000, 'GLB unexpectedly exceeds 5 MB'
    assert 1 <= len(document.get('materials',[])) <= 8, 'Unexpected material count'
    nodes = document['nodes']
    names = [node.get('name','') for node in nodes]
    assert len(names) == len(set(names)), 'Duplicate exported node names'
    assert not any(any(word in n.lower() for word in ['studio','camera','light.','floor']) for n in names), 'Studio object leaked into GLB'
    expected = ['gold-merchant-caravan','secured-carriage','rear-vault-door','locked-double-door',
                'locked-roof-strongbox','drawbars-traces-and-reins'] + ACTORS + HORSES
    assert all(n in names for n in expected), f'Missing nodes: {set(expected)-set(names)}'
    wheels = sorted(n for n in names if n.startswith('wheel-'))
    assert wheels == ['wheel-front-left','wheel-front-right','wheel-rear-left','wheel-rear-right'], wheels
    assert len([n for n in names if n.startswith('padded-collar-and-harness')]) == 2, 'Each horse needs a harness'
    top = document['scenes'][document.get('scene',0)]['nodes']
    assert len(top) == 1 and nodes[top[0]]['name'] == 'gold-merchant-caravan', 'Unexpected export roots'

    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    source = snapshot()
    for image in bpy.data.images:
        if image.source == 'FILE' and not image.packed_file:
            assert Path(bpy.path.abspath(image.filepath)).is_file(), f'Missing source image: {image.name}'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(EXPORT))
    imported = snapshot()
    assert all(obj.type in {'EMPTY','MESH'} for obj in bpy.context.scene.objects), 'Unexpected imported object type'
    exported_tree = set(tree(bpy.data.objects['gold-merchant-caravan']))
    assert exported_tree == set(bpy.context.scene.objects), 'Orphaned or leaked geometry'
    total = imported['gold-merchant-caravan']['triangles']
    assert 5_000 < total < 50_000, f'Unexpected triangle count: {total}'
    for name, before in source.items():
        after = imported[name]
        assert before['triangles'] == after['triangles'], f'{name}: source/export triangle mismatch'
        assert before['mesh_count'] == after['mesh_count'], f'{name}: source/export mesh mismatch'
        assert max(abs(a-b) for key in ['minimum','maximum'] for a,b in zip(before[key],after[key])) < .0001, f'{name}: export changed bounds'
    for name in ACTORS + HORSES:
        box = imported[name]
        assert abs(box['minimum'][2]) < .0001, f'{name}: feet not grounded ({box["minimum"][2]})'
        assert 2.0 < box['size'][2] < 3.5, f'{name}: incorrect up axis/height'
        root = bpy.data.objects[name]
        assert root.parent == bpy.data.objects['gold-merchant-caravan'], f'{name}: unexpected parent'
        assert max(abs(v-1) for v in root.scale) < .0001, f'{name}: non-unit scale'
    for name in ACTORS:
        labels = [obj.name for obj in bpy.data.objects[name].children]
        assert all(name+'-'+part in labels for part in ['body','head','left-arm','right-arm','left-leg','right-leg']), f'{name}: missing editable parts'
    horse_colors = []
    for name in HORSES:
        root = bpy.data.objects[name]
        members = list(tree(root))
        meshes = [obj for obj in members if obj.type == 'MESH']
        assert len(meshes) == 12, f'{name}: missing or duplicated horse parts'
        assert len([obj for obj in meshes if 'knee-mesh' in obj.name]) == 4, f'{name}: leg hierarchy wrong'
        inverse = root.matrix_world.inverted()
        head = next(obj for obj in meshes if 'head-mesh' in obj.name)
        tail = next(obj for obj in meshes if 'tail-mesh' in obj.name)
        head_center = sum((inverse @ head.matrix_world @ v.co for v in head.data.vertices),Vector()) / len(head.data.vertices)
        tail_center = sum((inverse @ tail.matrix_world @ v.co for v in tail.data.vertices),Vector()) / len(tail.data.vertices)
        assert head_center.y < tail_center.y-1, f'{name}: expected -Y forward after Blender reimport'
        body = next(obj for obj in meshes if 'body-mesh' in obj.name)
        horse_colors.append({tuple(round(c,3) for c in value.color) for attr in body.data.color_attributes for value in attr.data})
    assert horse_colors[0] != horse_colors[1], 'Horse coat variations are identical'
    a,b = [imported[name] for name in HORSES]
    assert a['maximum'][0] < b['minimum'][0], 'Horse geometries overlap'
    assert abs(a['size'][2]-b['size'][2]) < .0001, 'Horse scales differ'
    for name in wheels:
        wheel = bpy.data.objects[name]
        assert wheel.parent == bpy.data.objects['secured-carriage'], f'{name}: detached wheel'
        assert abs(geometry(wheel)['minimum'][2]) < .0001, f'{name}: wheel not grounded'
    grips = [
        ('guard-captain','sword-hand','right-arm','right-arm',(.56,.94,.34),(.11,.26,.11)),
        ('guard-spear','halberd-hand','right-arm','right-arm',(.62,.95,.33),(.09,.36,.09)),
        ('guard-crossbow','crossbow-trigger-hand','right-arm','crossbow',(0,1.095,.39),(.09,.24,.10)),
        ('guard-crossbow','crossbow-support-hand','left-arm','crossbow',(0,1.21,.65),(.14,.14,.84)),
    ]
    def authored_vertices(obj, actor):
        matrix = actor.matrix_world.inverted() @ obj.matrix_world
        return [Vector((p.x,p.z,-p.y)) for vertex in obj.data.vertices for p in [matrix @ vertex.co]]
    for actor_name,hand_name,parent_name,weapon_name,center,size in grips:
        actor = bpy.data.objects[actor_name]
        hand = bpy.data.objects[actor_name+'-'+hand_name]
        assert hand.parent.name == actor_name+'-'+parent_name, f'{hand.name}: detached hand'
        metadata = json.loads(hand['held_grip'])
        fingers = metadata['finger_boxes']
        actual = authored_vertices(hand,actor)
        expected = [Vector((x+a*w/2,h+b*height/2,f+c*d/2)) for x,h,f,w,height,d in fingers for a in [-1,1] for b in [-1,1] for c in [-1,1]]
        assert all(min((point-other).length for other in expected)<.00001 for point in actual), f'{hand.name}: finger geometry changed'
        assert all(min((point-other).length for other in actual)<.00001 for point in expected), f'{hand.name}: missing finger geometry'
        handle = authored_vertices(bpy.data.objects[actor_name+'-'+weapon_name],actor)
        corners = [Vector(tuple(center[i]+signs[i]*size[i]/2 for i in range(3))) for a in [-1,1] for b in [-1,1] for c in [-1,1] for signs in [(a,b,c)]]
        assert all(min((point-other).length for other in handle)<.00001 for point in corners), f'{hand.name}: actual handle moved'
        for finger in fingers:
            overlap = [min(finger[i]+finger[i+3]/2,center[i]+size[i]/2)-max(finger[i]-finger[i+3]/2,center[i]-size[i]/2) for i in range(3)]
            assert min(overlap)<0, f'{hand.name}: handle intersects finger block'
            assert min(overlap)>-.005, f'{hand.name}: fingers float away from handle'
    crossbow = bpy.data.objects['guard-crossbow-crossbow']
    assert crossbow.parent.name == 'guard-crossbow-right-arm', 'Crossbow must follow trigger arm'
    for side in ['left','right']:
        arm = bpy.data.objects['guard-crossbow-'+side+'-arm']
        assert min(p.y for p in authored_vertices(arm,bpy.data.objects['guard-crossbow']))>.93, 'Duplicate lowered crossbow hand/forearm'
    output = {'status':'passed','glb_bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
              'nodes':len(nodes),'meshes':len(document['meshes']),'materials':len(document['materials']),
              'triangles':total,'actors':ACTORS,'horses':HORSES,'wheels':wheels,
              'checks':['source opens','GLB fresh import','source/export geometry matches','actors and wheels grounded',
                        'both horses face forward','horse hierarchies distinct and complete','different horse coats',
                        'locked doors, strongbox, harness and reins present','no studio/camera/light leaks','no image dependencies',
                        'four actual weapon grips have touching fingers without intersections','no duplicate crossbow hands','crossbow follows trigger arm'],
              'bounds_blender_xyz':{name:{key:[round(v,5) for v in values] for key,values in entry.items() if isinstance(values,list)} for name,entry in imported.items()}}
    REPORT.parent.mkdir(parents=True,exist_ok=True)
    REPORT.write_text(json.dumps(output, separators=(',',':'))+'\n')
    print('GOLD_MERCHANT_VALIDATION '+json.dumps({k:v for k,v in output.items() if k!='bounds_blender_xyz'},separators=(',',':')))


if __name__ == '__main__':
    if '--inside-blender' in sys.argv:
        check()
    else:
        blender = os.environ.get('BLENDER_BIN') or shutil.which('blender') or '/Applications/Blender.app/Contents/MacOS/Blender'
        result = subprocess.run([blender,'--background','--python-exit-code','1','--python',str(Path(__file__).resolve()),'--','--inside-blender'],capture_output=True,text=True)
        if result.returncode:
            print(result.stdout[-7000:]+result.stderr[-3000:],file=sys.stderr)
            raise SystemExit(result.returncode)
        print(next(line for line in result.stdout.splitlines() if line.startswith('GOLD_MERCHANT_VALIDATION ')))
