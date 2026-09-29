"""Small, dependency-free contract check: python3 scripts/check-pet-assets.py."""
import hashlib
import json
import struct
import zlib
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
IDS={'moss-fox','moon-owl','ember-drake','crystal-tortoise','bloom-hare','lantern-moth','frost-cub','golden-pig'}
raw=(ROOT/'public/models/pets.glb').read_bytes()
assert struct.unpack_from('<III',raw)==(0x46546C67,2,len(raw))
length,kind=struct.unpack_from('<II',raw,12)
assert kind==0x4E4F534A
doc=json.loads(raw[20:20+length]);nodes=doc['nodes']
roots=doc['scenes'][doc.get('scene',0)]['nodes']
assert {nodes[i]['name'] for i in roots}==IDS and len(roots)==8
assert not doc.get('images') and len(doc['materials'])==3 and len(raw)<5_000_000
assert any(m.get('pbrMetallicRoughness',{}).get('metallicFactor',1)>.8 for m in doc['materials'])

def inspect(index,parent=(0,0,0)):
    node=nodes[index]
    assert node.get('scale',[1,1,1])==[1,1,1]
    assert node.get('rotation',[0,0,0,1])==[0,0,0,1]
    offset=tuple(a+b for a,b in zip(parent,node.get('translation',[0,0,0])))
    positions=[];triangles=0;calls=0;normals=[];names=[node.get('name','')]
    if 'mesh' in node:
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            accessor=doc['accessors'][primitive['attributes']['POSITION']]
            positions.extend(tuple(a+b for a,b in zip(offset,accessor[bound])) for bound in ('min','max'))
            triangles+=doc['accessors'][primitive['indices']]['count']//3
            calls+=1
            if node.get('name','').endswith('-head-mesh'):
                normal=doc['accessors'][primitive['attributes']['NORMAL']]
                view=doc['bufferViews'][normal['bufferView']]
                assert normal['componentType']==5126 and normal['type']=='VEC3'
                offset_bytes=28+length+view.get('byteOffset',0)+normal.get('byteOffset',0)
                normals.extend(struct.unpack_from('<3f',raw,offset_bytes+i*view.get('byteStride',12)) for i in range(normal['count']))
    if normals:
        # Axis-aligned exterior block faces distinguish the voxel heads from smooth spheres.
        assert sum(max(map(abs,n))>.9999 for n in normals)/len(normals)>.33,node['name']
    for child in node.get('children',[]):
        points,count,draws,labels=inspect(child,offset)
        positions+=points;triangles+=count;calls+=draws;names+=labels
    return positions,triangles,calls,names

def png_alpha(path):
    data=path.read_bytes();assert data[:8]==b'\x89PNG\r\n\x1a\n'
    pos=8;payload=b'';width=height=0
    while pos<len(data):
        size,kind=struct.unpack_from('>I4s',data,pos);chunk=data[pos+8:pos+8+size]
        if kind==b'IHDR':
            width,height,bits,color,_,_,interlace=struct.unpack('>IIBBBBB',chunk)
            assert (width,height,bits,color,interlace)==(256,256,8,6,0)
        if kind==b'IDAT':payload+=chunk
        pos+=12+size
    decoded=zlib.decompress(payload);stride=width*4;previous=bytearray(stride);pixels=[]
    for y in range(height):
        start=y*(stride+1);mode=decoded[start];row=bytearray(decoded[start+1:start+1+stride])
        for x in range(stride):
            left=row[x-4] if x>=4 else 0;above=previous[x];corner=previous[x-4] if x>=4 else 0
            if mode==1:prediction=left
            elif mode==2:prediction=above
            elif mode==3:prediction=(left+above)//2
            elif mode==4:
                p=left+above-corner;a,b,c=abs(p-left),abs(p-above),abs(p-corner)
                prediction=left if a<=b and a<=c else above if b<=c else corner
            else:assert mode==0;prediction=0
            row[x]=(row[x]+prediction)&255
        pixels.extend((x//4,y,row[x]) for x in range(3,stride,4) if row[x]>16)
        previous=row
    assert width*height*.07<len(pixels)<width*height*.70, (path,len(pixels))
    assert min(x for x,y,a in pixels)>2 and max(x for x,y,a in pixels)<width-3,path
    assert min(y for x,y,a in pixels)>2 and max(y for x,y,a in pixels)<height-3,path
    return hashlib.sha256(data).hexdigest()

summary=[];hashes=set()
for index in roots:
    node=nodes[index];name=node['name'];points,triangles,calls,names=inspect(index)
    height=max(p[1] for p in points);floor=min(p[1] for p in points)
    assert .5<height<1.2 and -.005<=floor<.09,(name,height,floor)
    assert abs(height-node['extras']['height'])<.001
    assert 6000<triangles<20000 and triangles==node['extras']['triangles'],(name,triangles)
    assert calls<=18,(name,calls)
    assert name+'-head' in names and name+'-tail' in names
    if name in {'moon-owl','lantern-moth','ember-drake'}:
        assert name+'-wing-left' in names and name+'-wing-right' in names
    if name not in {'moon-owl','lantern-moth'}:
        assert all(name+'-leg-'+limb in names for limb in ('front-left','front-right','rear-left','rear-right'))
    hashes.add(png_alpha(ROOT/'public/ui/pets'/f'{name}.png'))
    summary.append({'pet':name,'triangles':triangles,'drawCalls':calls,'height':round(height,3)})
assert len(hashes)==8
assert (ROOT/'assets/source/pets.blend').stat().st_size>500_000
preview=(ROOT/'assets/source/pets-preview.png').read_bytes()
assert struct.unpack_from('>II',preview,16)==(2400,1420)
print(json.dumps({'assetBytes':len(raw),'pets':summary,'icons':'8 unique, transparent, uncropped 256px portraits'},indent=2))
