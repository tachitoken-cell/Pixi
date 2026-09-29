"""Check the standalone Blender pet: python3 scripts/check-hearthling-pet.py."""
import itertools
import json
import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
raw = (ROOT / 'public/models/hearthling.glb').read_bytes()
assert struct.unpack_from('<III', raw) == (0x46546C67, 2, len(raw)), 'Invalid GLB header'
length, kind = struct.unpack_from('<II', raw, 12)
assert kind == 0x4E4F534A, 'Missing JSON chunk'
doc = json.loads(raw[20:20 + length])
nodes = doc['nodes']
roots = doc['scenes'][doc.get('scene', 0)]['nodes']
assert len(roots) == 1 and nodes[roots[0]]['name'] == 'hearthling'
assert not doc.get('images') and not doc.get('textures'), 'Pet must be texture-free'
assert len(raw) < 3_000_000 and len(doc['materials']) <= 8
root = nodes[roots[0]]
assert root.get('scale', [1, 1, 1]) == [1, 1, 1], 'Root scale must be one'
assert root.get('translation', [0, 0, 0]) == [0, 0, 0], 'Root must be at the origin'
assert root.get('rotation', [0, 0, 0, 1]) == [0, 0, 0, 1], 'Root rotation must be identity'
assert root.get('matrix', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) == [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def transform(point, node):
    if 'matrix' in node:
        matrix = node['matrix']
        return tuple(sum(matrix[column * 4 + row] * value for column, value in enumerate((*point, 1))) for row in range(3))
    point = tuple(a * b for a, b in zip(point, node.get('scale', [1, 1, 1])))
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    px, py, pz = point
    tx, ty, tz = 2 * (y * pz - z * py), 2 * (z * px - x * pz), 2 * (x * py - y * px)
    rotated = (px + w * tx + y * tz - z * ty, py + w * ty + z * tx - x * tz, pz + w * tz + x * ty - y * tx)
    return tuple(a + b for a, b in zip(rotated, node.get('translation', [0, 0, 0])))


points, names, triangles, draws = [], set(), 0, 0


def inspect(index, parents=()):
    global triangles, draws
    node = nodes[index]
    names.add(node.get('name', ''))
    chain = (node, *parents)
    if 'mesh' in node:
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            assert primitive.get('mode', 4) == 4, 'Expected triangle geometry'
            position = doc['accessors'][primitive['attributes']['POSITION']]
            count = doc['accessors'][primitive['indices']]['count'] if 'indices' in primitive else position['count']
            assert count % 3 == 0
            triangles += count // 3
            draws += 1
            for point in itertools.product(*zip(position['min'], position['max'])):
                for parent in chain:
                    point = transform(point, parent)
                assert all(math.isfinite(value) for value in point)
                points.append(point)
    for child in node.get('children', []):
        inspect(child, chain)


inspect(roots[0])
assert {'hearthling-' + part for part in ('body', 'head', 'arm-left', 'arm-right', 'leg-front-left', 'leg-front-right')} <= names
assert 100 < triangles < 30_000 and draws <= 40, (triangles, draws)
floor = min(point[1] for point in points)
height = max(point[1] for point in points)
assert -.005 <= floor < .03 and .5 < height < 1.2, (floor, height)


def check_icon(path):
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    offset, payload = 8, b''
    while offset < len(data):
        size, kind = struct.unpack_from('>I4s', data, offset)
        chunk = data[offset + 8:offset + 8 + size]
        if kind == b'IHDR':
            width, height, bits, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', chunk)
            assert (width, height, bits, color, compression, filtering, interlace) == (256, 256, 8, 6, 0, 0, 0)
        if kind == b'IDAT':
            payload += chunk
        offset += size + 12
    decoded = zlib.decompress(payload)
    stride = width * 4
    assert len(decoded) == height * (stride + 1)
    previous, visible, transparent = bytearray(stride), [], 0
    for y in range(height):
        start = y * (stride + 1)
        mode, row = decoded[start], bytearray(decoded[start + 1:start + 1 + stride])
        assert mode in range(5)
        for x in range(stride):
            left, above, corner = row[x - 4] if x >= 4 else 0, previous[x], previous[x - 4] if x >= 4 else 0
            p = left + above - corner
            paeth = min((left, above, corner), key=lambda value: abs(p - value))
            row[x] = (row[x] + (0, left, above, (left + above) // 2, paeth)[mode]) & 255
        visible.extend((x // 4, y) for x in range(3, stride, 4) if row[x] > 16)
        transparent += sum(row[x] == 0 for x in range(3, stride, 4))
        previous = row
    assert width * height * .07 < len(visible) < width * height * .8
    assert transparent > width * height * .15, 'Missing transparent background'
    assert min(x for x, y in visible) > 2 and max(x for x, y in visible) < width - 3, 'Icon cropped horizontally'
    assert min(y for x, y in visible) > 2 and max(y for x, y in visible) < height - 3, 'Icon cropped vertically'


check_icon(ROOT / 'public/ui/pets/hearthling.png')
assert (ROOT / 'assets/source/hearthling.blend').stat().st_size > 10_000
print(json.dumps({'assetBytes': len(raw), 'triangles': triangles, 'drawCalls': draws, 'height': round(height, 4), 'floor': round(floor, 4), 'icon': '256px, transparent, uncropped', 'source': 'hearthling.blend'}, indent=2))
