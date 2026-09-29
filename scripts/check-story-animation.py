"""Read-only Blender QA: blender -b assets/trailer-story/mossvale-story-trailer.blend --python scripts/check-story-animation.py."""
import json
import math

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

SHOTS = {"01-continuous-battle": 768}
EXPECTED_HITS = {97, 217, 289, 625, 673}
errors, report = [], []


def require(condition, message):
    if not condition:
        errors.append(message)


def top_parent(obj):
    while obj.parent:
        obj = obj.parent
    return obj


def set_frame(scene, frame):
    scene.frame_set(math.floor(frame), subframe=frame % 1)
    bpy.context.view_layer.update()


def in_camera(scene, root):
    corners = [world_to_camera_view(scene, scene.camera, child.matrix_world @ Vector(corner))
               for child in [root, *root.children_recursive]
               if child.type == "MESH" and not child.hide_render
               for corner in child.bound_box]
    front = [point for point in corners if point.z > 0]
    return bool(front and min(p.x for p in front) < 1 and max(p.x for p in front) > 0
                and min(p.y for p in front) < 1 and max(p.y for p in front) > 0)


def distance_to_actor(point, root):
    corners = [child.matrix_world @ Vector(corner)
               for child in root.children_recursive if child.type == 'MESH' and not child.hide_render
               for corner in child.bound_box]
    if not corners:
        return math.inf
    return math.sqrt(sum(max(min(p[i] for p in corners) - point[i], 0,
                             point[i] - max(p[i] for p in corners)) ** 2 for i in range(3)))


require(len([scene for scene in bpy.data.scenes if scene.camera]) == 1,
        "The trailer must contain exactly one camera scene, with no cuts")
for name, duration in SHOTS.items():
    scene = bpy.data.scenes.get(name)
    require(scene is not None, f"Missing scene {name}")
    if scene is None:
        continue
    bpy.context.window.scene = scene
    require(scene.frame_start == 1 and scene.frame_end == duration, f"{name}: wrong frame range")
    require(scene.camera is not None, f"{name}: missing camera")
    require(scene.render.fps == 24, f"{name}: expected 24 fps")
    runs, attacks = {}, {}
    for obj in scene.objects:
        if not obj.animation_data:
            continue
        for track in obj.animation_data.nla_tracks:
            if track.mute:
                continue
            for strip in track.strips:
                if strip.mute or not strip.action:
                    continue
                action_name = strip.action.name.lower()
                require(strip.action_slot is not None, f"{name}/{obj.name}: unbound action {action_name}")
                if strip.action_slot and obj.get('source_node'):
                    require(strip.action_slot.identifier == 'OB' + obj['source_node'],
                            f"{obj.name}: action slot targets the wrong rig node")
                if "run" in action_name and any(hero in action_name for hero in ("ranger", "knight", "mage")):
                    root = top_parent(obj)
                    runs.setdefault((root, strip.frame_start, strip.frame_end), []).append((obj, strip))
                if "attack" in action_name:
                    attacks.setdefault((top_parent(obj), strip.frame_start, strip.frame_end), []).append((obj, strip))
    row = {"scene": name, "running_heroes": [], "markers": {m.name: m.frame for m in scene.timeline_markers}}
    for (root, _, _), users in runs.items():
        legs = [(obj, strip) for obj, strip in users if "leg" in obj.name.lower()]
        require(bool(legs), f"{name}/{root.name}: no animated leg users")
        if not legs:
            continue
        limb, strip = legs[0]
        start, end = max(1, strip.frame_start), min(duration, strip.frame_end)
        period = min(end - start, max(1, (strip.action_frame_end - strip.action_frame_start) * strip.scale))
        set_frame(scene, start + period * .25)
        a = limb.matrix_basis.copy()
        set_frame(scene, start + period * .75)
        b = limb.matrix_basis.copy()
        articulation = max(abs(a[i][j] - b[i][j]) for i in range(4) for j in range(4))
        require(articulation > .005, f"{name}/{root.name}: run leg is static ({articulation:.5f})")
        set_frame(scene, start)
        begin = root.matrix_world.translation.copy()
        set_frame(scene, end)
        distance = (root.matrix_world.translation - begin).length
        require(distance > .05, f"{name}/{root.name}: running in place ({distance:.3f} m)")
        set_frame(scene, (start + end) / 2)
        framed = in_camera(scene, root) if scene.camera else False
        require(framed, f"{name}/{root.name}: outside camera midway through run")
        row["running_heroes"].append({"root": root.name, "displacement": round(distance, 3),
                                      "frames": [start, end], "leg_delta": round(articulation, 4), "in_camera": framed})
    require(bool(runs), f"{name}: no active hero run strips")
    heroes = [obj for obj in scene.objects if obj.get('actor_role') in ('ranger', 'knight', 'mage')]
    require(len(heroes) == 3, f"{name}: expected the same three heroes throughout")
    for hero in heroes:
        require(any(root == hero for root, _, _ in runs), f"{hero.name}: no run action")
        require(any(root == hero for root, _, _ in attacks), f"{hero.name}: no combat action")
    for (root, start, end), users in attacks.items():
        set_frame(scene, start)
        rest = [obj.matrix_basis.copy() for obj, _ in users]
        set_frame(scene, start + (end - start) * .3)
        delta = max(abs(before[i][j] - obj.matrix_basis[i][j])
                    for before, (obj, _) in zip(rest, users) for i in range(4) for j in range(4))
        require(delta > .01, f"{root.name}: static attack at {start}-{end}")
    projectiles = [obj for obj in scene.objects if obj.get('projectile')]
    require({int(obj['hit']) for obj in projectiles} == EXPECTED_HITS, "Unexpected projectile hit choreography")
    row['projectiles'] = []
    for obj in projectiles:
        launch, hit = int(obj['launch']), int(obj['hit'])
        shooter = 'ranger' if 'arrow' in obj.name else 'mage'
        phases = [(launch - start) / (end - start) for root, start, end in attacks
                  if root.get('actor_role') == shooter and start <= launch < end]
        require(any(.24 <= phase <= .36 for phase in phases), f"{obj.name}: release does not match its hero's casting pose")
        for suffix, frame in [('release', launch), ('hit', hit), ('impact', hit)]:
            require(row['markers'].get(obj.name + '-' + suffix) == frame,
                    f"{obj.name}: {suffix} marker differs from its animation")
        set_frame(scene, hit)
        gap = (obj.matrix_world.translation - Vector(obj['target'])).length
        require(gap < .001, f"{obj.name}: misses its target by {gap:.3f} m")
        require(min(obj.scale) > .5, f"{obj.name}: hidden at contact")
        monsters = [target for target in scene.objects if target.get('actor_role') in ('wolf', 'golem', 'boss')
                    and min(target.scale) > .01]
        monster_gap = min((distance_to_actor(obj.matrix_world.translation, target) for target in monsters), default=math.inf)
        require(monster_gap < .45, f"{obj.name}: impact is {monster_gap:.2f} m outside every visible monster")
        flash = scene.objects.get(obj.name + '-impact flash')
        require(flash is not None and max(flash.scale) > .1, f"{obj.name}: missing contact VFX flash")
        for frame in [launch - 1, hit + 1]:
            set_frame(scene, frame)
            require(max(obj.scale) < .01, f"{obj.name}: visible outside its flight at {frame}")
        set_frame(scene, (launch + hit) / 2)
        require(in_camera(scene, obj), f"{obj.name}: flight outside camera")
        row['projectiles'].append({'name': obj.name, 'launch': launch, 'hit': hit, 'target_gap': round(gap, 5),
                                   'monster_bounds_gap': round(monster_gap, 4)})
    for frame in [61, 97, 181, 217, 289, 337, 505, 577, 625, 673, 709]:
        require(frame in row['markers'].values(), f"Missing choreographed contact marker at {frame}")
    require(row['markers'].get('boss-impact') == 505, "Boss slam contact must occur at frame 505")
    sword_frames = sorted(marker.frame for marker in scene.timeline_markers if marker.name == 'sword-contact')
    require(sword_frames == [61, 181, 337, 577], "Sword contact markers do not match the four strikes")
    for role, frames in [('knight', sword_frames), ('boss', [505])]:
        for frame in frames:
            require(any(root.get('actor_role') == role and abs((start + end) / 2 - frame) < .01
                        for root, start, end in attacks), f"{role}: contact {frame} is not at its attack clip's impact phase")
    defeated = [obj for obj in scene.objects if 'defeat_frame' in obj]
    require({int(obj['defeat_frame']) for obj in defeated} == {61, 97, 181, 217, 289, 337, 709}, "Wrong monster defeat timings")
    for obj in defeated:
        hit = int(obj['defeat_frame'])
        require(row['markers'].get(obj.name + '-defeated') == hit, f"{obj.name}: defeat marker mismatch")
        set_frame(scene, duration)
        require(max(obj.scale) < .01, f"{obj.name}: defeated monster remains visible")
    report.append(row)

print("STORY_ANIMATION_QA", json.dumps({"scenes": report, "errors": errors}, indent=2))
assert not errors, "Story animation QA failed: " + "; ".join(errors)
print("PASS: continuous 768-frame scene, bound limbs, every hero run and attack, camera coverage, projectile contacts and defeats")
