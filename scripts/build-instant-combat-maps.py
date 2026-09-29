"""Faithful game exports of Benji's Bone Pit and Void Rift sources.
Blender --background --threads 4 --disable-autoexec --python scripts/build-instant-combat-maps.py -- --render
Keeps every authored landmark; normalizes only walkable tile/platform heights to game Y=0.
"""
import bpy, json, math, hashlib, sys
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/instant-combat'
RENDER = '--render' in sys.argv
COLLIDERS_ONLY = '--colliders-only' in sys.argv
colliders, audits = {}, []

def components(mesh):
    parent = list(range(len(mesh.vertices)))
    def find(a):
        while a != parent[a]:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for edge in mesh.edges:
        parent[find(edge.vertices[0])] = find(edge.vertices[1])
    groups = {}
    for v in mesh.vertices:
        groups.setdefault(find(v.index), []).append(v)
    return groups.values()

def footprint(vertices):
    return [min(v.co[i] for v in vertices) for i in range(3)] + [max(v.co[i] for v in vertices) for i in range(3)]

def merge_footprints(boxes):
    # Join touching pieces of the same solid so a skeleton does not cost dozens of collision checks.
    while True:
        joined = False
        for i, a in enumerate(boxes):
            for j in range(i + 1, len(boxes)):
                b = boxes[j]
                union = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]), max(a[4], b[4])]
                if (a[0] <= b[2] + .1 and a[2] + .1 >= b[0] and a[1] <= b[3] + .1 and a[3] + .1 >= b[1]
                        and max(union[2] - union[0], union[3] - union[1]) <= 8):
                    boxes[i] = union
                    boxes.pop(j)
                    joined = True
                    break
            if joined: break
        if not joined: break
    return sorted(boxes)

for map_id in ['bone-pit', 'void-rift']:
    source = SOURCE / 'original' / f'mossvale_{map_id.replace("-", "_")}_arena.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    scene.name = 'Instant Combat - ' + map_id
    meshes = [o for o in scene.objects if o.type == 'MESH' and not o.hide_render]
    raw_footprints = []
    flattened = 0
    for obj in meshes:
        mesh = obj.data
        # Sources are joined material batches; apply their authored transform before deriving world footprints.
        mesh.transform(obj.matrix_world)
        obj.matrix_world.identity()
        for vertices in components(mesh):
            b = footprint(vertices)
            cx, cy = (b[0] + b[3]) / 2, (b[1] + b[4]) / 2
            tile = obj.name == 'Arena_Sand_Floor' and b[5] <= .4
            platform = obj.name == 'Gameplay_Props' and max(abs(b[0]), abs(b[1]), abs(b[3]), abs(b[4])) < 4.7 and b[5] < .9
            if tile or platform:
                # Preserve tile cracks and shallow inlays above the common ground without floating player feet.
                top = .012 if b[2] > 0 else 0
                if platform: top = .022 if b[2] > .7 else .005 if b[2] > .4 else .002
                dz = b[5] - top
                for v in vertices: v.co.z -= dz
                flattened += 1
                continue
            if obj.name not in ['Arena_Sand_Floor', 'Gameplay_Props', 'Scattered_Bones', 'Void_Remains']: continue
            if b[2] > 1.8 or b[5] < .85 or math.hypot(cx, cy) > 34: continue
            if min(b[3] - b[0], b[4] - b[1]) < .2: continue
            raw_footprints.append([b[0], -b[4], b[3], -b[1], b[5]])
        mesh.update()
    footprints = merge_footprints(raw_footprints)
    colliders[map_id] = [dict(x=round((a+c)/2,3), z=round((b+d)/2,3), r=round(math.hypot(c-a,d-b)/2,3), halfWidth=round((c-a)/2,3), halfDepth=round((d-b)/2,3), height=round(height,3)) for a,b,c,d,height in footprints]
    if COLLIDERS_ONLY: continue
    # One authored material for hundreds of identical star materials, preserving all shader values.
    canonical = {}
    for obj in meshes:
        for slot in obj.material_slots:
            mat = slot.material
            if not mat: continue
            shader = mat.node_tree.nodes.get('Principled BSDF') if mat.use_nodes else None
            if not shader: continue
            signature = tuple(round(float(v), 6) for key in ['Base Color','Roughness','Metallic','Emission Color','Emission Strength','Alpha'] for v in (shader.inputs[key].default_value if hasattr(shader.inputs[key].default_value,'__len__') else [shader.inputs[key].default_value]))
            if signature in canonical: slot.material = canonical[signature]
            else: canonical[signature] = mat
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            # Keep the authored chamfer width; a single facet avoids invisible curved subdivisions at game scale.
            if modifier.type == 'BEVEL': modifier.segments = 1
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    for obj in meshes: obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    arena = bpy.context.object
    arena.name = 'instant-combat-' + map_id
    # Joining retains unused duplicate slots; compact them to avoid extra draw calls.
    materials, remap = [], {}
    for i, mat in enumerate(arena.data.materials):
        if mat not in materials: materials.append(mat)
        remap[i] = materials.index(mat)
    indices = [remap[p.material_index] for p in arena.data.polygons]
    arena.data.materials.clear()
    for mat in materials: arena.data.materials.append(mat)
    for polygon, index in zip(arena.data.polygons, indices): polygon.material_index = index
    arena['source_sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    arena['contract'] = 'Authored scale, Y-up export. Walkable floor Y=0. Playable radius34. Collision derived from source solids.'
    arena['map_id'] = map_id
    out = ROOT / 'public/models' / f'instant-combat-{map_id}.glb'
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False, export_extras=True)
    audit = dict(mapId=map_id, original=source.name, sha256=arena['source_sha256'], vertices=len(arena.data.vertices), triangles=sum(len(p.vertices)-2 for p in arena.data.polygons), materials=len(materials), propColliders=len(footprints), normalizedFloorParts=flattened, glbBytes=out.stat().st_size)
    audits.append(audit)
    # Fresh camera corrects the source's unframed render camera without changing the scene content.
    if scene.camera: scene.camera.hide_render = True
    camera_data = bpy.data.cameras.new('Game export preview')
    camera = bpy.data.objects.new('Game export preview', camera_data)
    scene.collection.objects.link(camera)
    camera.location = (82, -100, 103)
    camera.rotation_euler = (Vector((0, 6, 2)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.type = 'ORTHO'; camera_data.ortho_scale = 130; camera_data.clip_end = 1000
    scene.camera = camera
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 32
    scene.render.resolution_x = 1400; scene.render.resolution_y = 1100; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(SOURCE / f'{map_id}-preview.png')
    # The source viewport is the intended look. A broad fill makes the same color facets readable in exported stills.
    fill_data = bpy.data.lights.new('Preview fill', 'AREA'); fill_data.energy = 2500; fill_data.shape = 'DISK'; fill_data.size = 70
    fill = bpy.data.objects.new('Preview fill', fill_data); scene.collection.objects.link(fill); fill.location = (0,-30,55)
    fill.rotation_euler = (Vector((0,0,0)) - fill.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / f'{map_id}.blend'))
    if RENDER: bpy.ops.render.render(write_still=True)
    print(json.dumps(audit))
metadata = ROOT / 'src/instant-combat-maps.ts'
text = metadata.read_text()
start, end = '// BEGIN GENERATED COLLIDERS', '// END GENERATED COLLIDERS'
body = '\n'.join('  '+json.dumps(map_id)+': [\n'+',\n'.join('    '+json.dumps(c,separators=(',',':')) for c in values)+'\n  ],' for map_id, values in colliders.items())
metadata.write_text(text.split(start)[0] + start + '\n' + body + '\n' + end + text.split(end)[1])
if not COLLIDERS_ONLY: (SOURCE / 'map-audit.json').write_text(json.dumps(audits, indent=2) + '\n')
