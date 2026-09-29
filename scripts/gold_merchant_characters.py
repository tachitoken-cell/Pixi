"""Mossvale gold caravan actors. Call build_characters() inside Blender.

Four ground-centred roots, metres, Blender Z up / -Y forward. Named rigid body,
head, arm and leg parts stay editable. No scene reset, exports or side effects
outside the objects/material created by this function.
"""
import math
import json
import bpy
from mathutils import Vector


def build_characters():
    palette = {
        'green': '244D43', 'greenlight': '38745B', 'greendark': '183831',
        'wine': '673534', 'winelight': '925249', 'cream': 'E9D9AE',
        'gold': 'C39A45', 'goldlight': 'F4D481', 'leather': '5B3728',
        'leatherlight': '946342', 'dark': '292B2A', 'steel': '71868B',
        'steellight': 'A9BDB9', 'steeldark': '40545A', 'skin': 'C99067',
        'skinlight': 'E3AD7C', 'hair': '4B3026', 'gray': 'AAB4A2',
        'white': 'F5E9C8', 'wood': '735035', 'woodlight': 'AD7B4F',
        'paper': 'D2BC8C', 'ink': '283F3D',
    }
    def linear(v):
        return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
    colors = {k: tuple(linear(int(h[i:i+2], 16)/255) for i in (0, 2, 4)) + (1,) for k, h in palette.items()}
    material = bpy.data.materials.new('Caravan actor vertex palette')
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .77
    attr = material.node_tree.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'CaravanTint'
    material.node_tree.links.new(attr.outputs['Color'], shader.inputs['Base Color'])
    roots = {}
    parts = {}
    active = None
    current = None
    # Author the same x / height / forward coordinates as the existing NPC kit.
    def xyz(x, h, f):
        return Vector((x, -f, h))
    def actor(name):
        nonlocal active
        active = name
        root = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(root)
        root['role'] = name
        root['contract'] = 'Metres; Z up; -Y forward; ground origin; static rigid parts'
        roots[name] = root
        parts[name] = {}
    def part(name, pivot=(0, 0, 0), parent=None):
        nonlocal current
        current = parts[active].setdefault(name, {'pivot': xyz(*pivot), 'v': [], 'f': [], 'c': [], 'parent': parent})
    def shape(tint, vertices, faces):
        offset = len(current['v'])
        current['v'].extend(tuple(xyz(*p) - current['pivot']) for p in vertices)
        current['f'].extend(tuple(offset + i for i in f) for f in faces)
        current['c'].extend([colors[tint]] * len(faces))
    def box(tint, x, h, f, w, height, depth, angle=0):
        c, s = math.cos(angle), math.sin(angle)
        verts = []
        for a, b, d in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
            xx, hh = a*w/2, b*height/2
            verts.append((x + xx*c - hh*s, h + xx*s + hh*c, f + d*depth/2))
        shape(tint, verts, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
    def prism(tint, polygon, f, depth):
        if sum(polygon[i][0]*polygon[(i+1)%len(polygon)][1] - polygon[(i+1)%len(polygon)][0]*polygon[i][1] for i in range(len(polygon))) < 0:
            polygon = list(reversed(polygon))
        n = len(polygon)
        verts = [(x,h,f + side*depth/2) for side in [-1,1] for x,h in polygon]
        shape(tint, verts, [tuple(reversed(range(n))), tuple(range(n,2*n))] + [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)])
    def rod(tint, a, b, width):
        # Build a true oriented square-section beam, including reins/weapon grips.
        start, end = Vector(a), Vector(b)
        d = (end-start).normalized()
        u = d.cross(Vector((0,0,1)))
        if u.length < .01:
            u = d.cross(Vector((1,0,0)))
        u.normalize()
        v = d.cross(u).normalized()
        verts = [tuple(p + u*su*width/2 + v*sv*width/2) for p in (start,end) for su,sv in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        shape(tint, verts, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
    def face(skin='skin', beard=False):
        part('head', (0,1.66,0))
        box(skin,0,1.91,.03,.64,.54,.54)
        for side in [-1,1]:
            box(skin,side*.34,1.91,.02,.10,.15,.18)
            box('hair',side*.28,2.08,.08,.08,.15,.27)
            box('dark',side*.15,1.975,.316,.075,.072,.023)
            box('white',side*.166,1.993,.332,.025,.023,.014)
            box('hair',side*.15,2.052,.325,.12,.031,.023)
        box(skin,0,1.885,.352,.12,.13,.13)
        box('hair',0,2.185,-.015,.67,.13,.59)
        box('hair',0,1.96,-.27,.64,.32,.09)
        box('hair',0,1.80,.326,.30,.075,.08)
        for side in [-1,1]:
            box('hair',side*.19,1.815,.337,.12,.06,.09,side*.2)
        if beard:
            box('hair',0,1.74,.28,.37,.12,.17)
            box('hair',0,1.695,.275,.24,.09,.15)
    def legs(armored=False, wide=.22):
        for side,label in [(-1,'left-leg'),(1,'right-leg')]:
            part(label,(side*wide,.79,0))
            box('dark',side*wide,.08,.08,.33,.16,.53)
            box('leather',side*wide,.29,.015,.29,.37,.36)
            box('gold',side*wide,.43,.20,.16,.055,.035)
            box('steeldark' if armored else 'wine',side*wide,.63,-.01,.28,.39,.33)
            if armored:
                box('steel',side*wide,.47,.205,.29,.17,.10)
                box('steellight',side*wide,.52,.26,.19,.045,.035)
                box('steel',side*wide,.23,.21,.24,.24,.075)
    def arms(armored=True, crossbow=False):
        for side,label in [(-1,'left-arm'),(1,'right-arm')]:
            part(label,(side*.49,1.50,0))
            if crossbow:
                box('steeldark',side*.52,1.37,.01,.28,.25,.36)
                continue
            box('steeldark' if armored else 'green',side*.52,1.25,.01,.28,.48,.36)
            box('steel' if armored else 'cream',side*.53,1.03,.04,.30,.15,.38)
            if not armored or side < 0:
                box('leather' if armored else 'skin',side*.53,.90,.08,.22,.22,.25)
            box('gold',side*.53,1.085,.239,.15,.04,.032)
    def grip(name, center, handle, parent='right-arm', support=False):
        # Four finger blocks leave a real opening around the handle, like player grips.
        x,h,f = center
        part(name, center, parent)
        w,d = handle
        opening_x,opening_d = w+.004,d+.004
        outer_x,outer_d = max(.24,opening_x+.10),max(.25,opening_d+.10)
        finger_boxes = []
        if support:
            # Support a horizontal stock underneath; leave its loaded bolt clear above.
            for side in [-1,1]:
                finger_boxes.append((x+side*(opening_x+outer_x)/4,h-.005,f,(outer_x-opening_x)/2,.15,.18))
            finger_boxes.append((x,h-d/2-.037,f,outer_x,.066,.18))
        else:
            for side in [-1,1]:
                finger_boxes.append((x+side*(opening_x+outer_x)/4,h,f,(outer_x-opening_x)/2,.16,opening_d))
                finger_boxes.append((x,h,f+side*(opening_d+outer_d)/4,outer_x,.16,(outer_d-opening_d)/2))
        for dimensions in finger_boxes:
            box('leather',*dimensions)
        current['grip'] = {'center': list(xyz(*center)), 'handle': list(handle), 'support': support,
                           'opening': [opening_x,opening_d], 'finger_boxes': finger_boxes}
    def guard(name, kind):
        actor(name)
        legs(True)
        part('body')
        box('greendark',0,1.15,0,.76,.75,.48)
        box('steel',0,1.30,.12,.76,.48,.35)
        box('steellight',0,1.49,.22,.66,.10,.22)
        box('green',0,1.26,.315,.33,.52,.045)
        box('green',0,.78,.28,.47,.44,.075)
        box('gold',0,1.30,.344,.20,.045,.028)
        box('gold',0,1.30,.345,.05,.22,.03)
        box('cream',0,.61,.33,.48,.05,.025)
        box('leather',0,.98,.035,.81,.11,.53)
        box('gold',0,.98,.322,.17,.13,.05)
        for side in [-1,1]:
            box('steeldark',side*.39,1.48,0,.28,.23,.55)
            box('steel',side*.46,1.56,0,.31,.15,.55)
            box('gold',side*.46,1.655,.04,.31,.045,.45)
            for i in range(3):
                box('steel' if i%2==0 else 'steeldark',side*.24,.84-i*.055,.025,.38,.05,.51)
        for i in range(5):
            box('green' if kind != 'captain' else 'wine',0,1.43-i*.19,-.30-i*.03,.76-i*.055,.21,.12)
        box('cream',0,.58,-.43,.54,.055,.14)
        face('skinlight' if kind=='captain' else 'skin', kind=='captain')
        box('steel',0,2.25,-.045,.74,.23,.66)
        box('steellight',0,2.40,-.07,.52,.10,.49)
        box('gold',0,2.195,.31,.76,.055,.07)
        for side in [-1,1]:
            box('steel',side*.35,1.99,-.065,.12,.39,.55)
            box('steellight',side*.35,1.81,.13,.12,.17,.15)
        box('green',0,2.47,-.03,.13,.10,.39)
        if kind=='captain':
            for i in range(4):
                box('winelight' if i%2 else 'wine',0,2.54-i*.05,-.09-i*.13,.15,.17,.17)
        arms(crossbow=kind=='crossbow')
        if kind=='captain':
            part('right-arm',(.49,1.50,0))
            box('leather',.56,.94,.34,.11,.26,.11)
            box('gold',.56,.77,.34,.14,.08,.14)
            box('gold',.56,1.09,.34,.44,.085,.14)
            prism('steellight',[(.49,1.14),(.63,1.14),(.63,1.96),(.56,2.13),(.49,1.96)],.34,.07)
            box('steel',.56,1.56,.382,.022,.80,.018)
            grip('sword-hand',(.56,.94,.34),(.11,.11))
            part('left-arm',(-.49,1.50,0))
            poly=[(-.94,1.52),(-.68,1.64),(-.34,1.52),(-.38,1.04),(-.64,.79),(-.90,1.04)]
            prism('gold',poly,.46,.13)
            prism('green',[(-.89,1.48),(-.67,1.58),(-.39,1.48),(-.43,1.07),(-.64,.87),(-.85,1.07)],.54,.03)
            prism('gold',[(-.77,1.27),(-.64,1.41),(-.51,1.27),(-.64,1.13)],.565,.04)
            box('goldlight',-.64,1.275,.595,.065,.065,.028)
        elif kind=='spear':
            part('right-arm',(.49,1.50,0))
            rod('wood',(.62,.14,.33),(.62,2.90,.33),.065)
            box('leather',.62,.95,.33,.09,.36,.09)
            box('gold',.62,2.77,.33,.13,.10,.13)
            prism('steellight',[(.62,3.25),(.76,2.97),(.65,2.83),(.59,2.83),(.48,2.97)],.33,.075)
            prism('steel',[(.65,2.97),(.92,2.82),(.96,2.61),(.79,2.66),(.65,2.78)],.33,.07)
            box('green',.73,2.60,.32,.24,.30,.035)
            box('gold',.73,2.45,.32,.24,.055,.04)
            grip('halberd-hand',(.62,.95,.33),(.09,.09))
            part('left-arm',(-.49,1.50,0))
            prism('steeldark',[(-.85,1.32),(-.52,1.44),(-.23,1.32),(-.26,.97),(-.52,.82),(-.81,.97)],.37,.12)
            prism('green',[(-.80,1.29),(-.52,1.38),(-.28,1.29),(-.31,1),(-.52,.89),(-.76,1)],.445,.035)
            box('gold',-.52,1.13,.48,.13,.13,.05)
        else:
            part('body')
            box('leather',.28,1.28,-.47,.30,.69,.28)
            for h in [.99,1.51]:
                box('gold',.28,h,-.48,.32,.055,.29)
            for i in range(4):
                x=.17+i*.073
                box('woodlight',x,1.68,-.48,.029,.42,.029)
                box('cream',x,1.87,-.48,.060,.15,.045)
            part('left-arm',(-.49,1.50,0))
            rod('steel',(-.52,1.29,.05),(-.19,1.16,.78),.19)
            grip('crossbow-support-hand',(0,1.21,.78),(.14,.14),'left-arm',True)
            part('right-arm',(.49,1.50,0))
            rod('steel',(.52,1.29,.05),(.19,1.065,.39),.19)
            grip('crossbow-trigger-hand',(0,1.065,.39),(.09,.10))
            part('crossbow',(0,1.18,.49),'right-arm')
            box('wood',0,1.21,.65,.14,.14,.84)
            box('leather',0,1.095,.39,.09,.24,.10)
            box('gold',0,1.25,.60,.20,.055,.19)
            for side in [-1,1]:
                rod('steeldark',(0,1.23,.89),(side*.36,1.23,.81),.07)
                rod('steel',(side*.36,1.23,.81),(side*.56,1.23,.67),.065)
                rod('cream',(side*.56,1.24,.67),(0,1.24,.40),.016)
            rod('woodlight',(0,1.30,.35),(0,1.30,1.04),.025)
            box('steellight',0,1.30,1.075,.055,.04,.09)

    actor('merchant')
    legs(False,.245)
    part('body')
    box('green',0,1.10,0,.98,.86,.63)
    box('greenlight',0,.70,.015,1.06,.22,.69)
    box('cream',0,1.35,.36,.26,.48,.055)
    for side in [-1,1]:
        box('greendark',side*.20,1.36,.357,.20,.51,.055,side*.20)
        box('gold',side*.28,1.44,.398,.035,.30,.028,side*.20)
        box('cream',side*.46,1.47,0,.19,.15,.66)
        for h in [1.07,1.20,1.33]:
            box('goldlight',side*.29,h,.36,.067,.067,.040)
    box('leather',0,.96,.035,1.02,.12,.67)
    box('gold',0,.96,.399,.23,.17,.075)
    box('greendark',0,.96,.442,.12,.08,.014)
    for i in range(5):
        box('wine' if i%2 else 'winelight',0,1.48-i*.20,-.37-i*.034,1.03-i*.045,.23,.14)
    box('cream',0,.57,-.51,.86,.07,.15)
    box('wine',.44,.82,.15,.30,.39,.34)
    box('gold',.45,1.035,.16,.21,.065,.26)
    box('goldlight',.46,.87,.331,.10,.10,.036)
    # Small square keyring and two visibly different keys at the belt.
    for x,h,w,hh in [(-.49,.88,.17,.025),(-.49,1.01,.17,.025),(-.565,.945,.025,.13),(-.415,.945,.025,.13)]:
        box('gold',x,h,.40,w,hh,.04)
    for x,h in [(-.53,.75),(-.44,.72)]:
        box('goldlight',x,h,.41,.028,.25,.035)
        box('goldlight',x+.035,h-.10,.41,.09,.035,.035)
    face('skinlight',True)
    box('greendark',0,2.23,0,.94,.09,.80)
    box('green',-.06,2.35,-.03,.67,.18,.59)
    box('greenlight',-.10,2.46,-.05,.49,.09,.43)
    box('wine',-.06,2.30,.285,.68,.085,.04)
    box('gold',.19,2.31,.325,.12,.12,.045)
    rod('gold',(-.35,2.29,.03),(-.58,2.76,.00),.025)
    for i in range(4):
        box('cream',-.40-i*.052,2.43+i*.09,.01,.16-i*.019,.12,.046,-.3)
    arms(False)
    part('left-arm',(-.49,1.50,0))
    # Leather-bound ledger carried firmly at his side.
    box('wine',-.65,.92,.21,.34,.55,.23,-.12)
    box('paper',-.65,.92,.222,.29,.46,.20,-.12)
    for f in [.10,.35]:
        box('wine',-.65,.92,f,.36,.55,.035,-.12)
    box('gold',-.64,.94,.381,.24,.06,.025,-.12)
    box('gold',-.64,1.06,.381,.04,.16,.025,-.12)
    part('right-arm',(.49,1.50,0))
    box('leather',.56,.88,.23,.22,.31,.20)
    box('goldlight',.56,1.045,.23,.20,.055,.17)
    for x in [.51,.57,.62]:
        box('gold',x,1.086,.23,.053,.032,.11)

    guard('guard-captain','captain')
    guard('guard-spear','spear')
    guard('guard-crossbow','crossbow')
    triangles = 0
    for name, groups in parts.items():
        for label, data in groups.items():
            mesh = bpy.data.meshes.new(name+'-'+label+'-geometry')
            mesh.from_pydata(data['v'], [], data['f'])
            mesh.materials.append(material)
            tint = mesh.color_attributes.new(name='CaravanTint', type='BYTE_COLOR', domain='CORNER')
            for polygon,color in zip(mesh.polygons,data['c']):
                for index in polygon.loop_indices:
                    tint.data[index].color = color
            mesh.update()
            obj = bpy.data.objects.new(name+'-'+label,mesh)
            bpy.context.scene.collection.objects.link(obj)
            parent = data.get('parent')
            obj.parent = bpy.data.objects[name+'-'+parent] if parent else roots[name]
            obj.location = data['pivot'] - (parts[name][parent]['pivot'] if parent else Vector())
            obj['part'] = label
            if 'grip' in data:
                obj['held_grip'] = json.dumps(data['grip'])
            triangles += sum(len(p.vertices)-2 for p in mesh.polygons)
        roots[name]['triangles'] = sum(sum(len(face)-2 for face in data['f']) for data in groups.values())
    assert set(roots) == {'merchant','guard-captain','guard-spear','guard-crossbow'}
    assert triangles < 10000, triangles
    assert all(root.location.length == 0 for root in roots.values())
    return roots
