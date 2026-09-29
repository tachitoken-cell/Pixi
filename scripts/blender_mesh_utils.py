"""Exact hidden-face removal shared by the authored building kits."""
import math
from mathutils import Vector

def remove_hidden_box_faces(data):
    # Remove only complete faces hidden by another box in this same cutaway part.
    # This keeps authored pivots/positions exact and avoids decoder dependencies.
    cells={}
    for index,(low,high,_) in enumerate(data['boxes']):
        for x in range(math.floor(low[0]),math.floor(high[0])+1):
            for y in range(math.floor(low[1]),math.floor(high[1])+1):
                for z in range(math.floor(low[2]),math.floor(high[2])+1):cells.setdefault((x,y,z),[]).append(index)
    hidden=set()
    for index,(_,_,first) in enumerate(data['boxes']):
        for face_index in range(first,first+6):
            vertices=[Vector(data['vertices'][i]) for i in data['faces'][face_index]]
            centre=sum(vertices,Vector())/4;normal=(vertices[1]-vertices[0]).cross(vertices[2]-vertices[0]).normalized()
            # Float32 vectors need a probe larger than their rounding at city scale.
            # Coplanar exposed faces must never both disappear.
            probe=centre+normal*.0001
            for other in cells.get(tuple(math.floor(v) for v in probe),[]):
                if other==index:continue
                low,high,_=data['boxes'][other]
                if all(low[a]-.0000001<=probe[a]<=high[a]+.0000001 for a in range(3)) and all(low[a]-.0000001<=v[a]<=high[a]+.0000001 for v in vertices for a in range(3)):
                    hidden.add(face_index);break
    data['faces']=[face for i,face in enumerate(data['faces']) if i not in hidden]
    data['colors']=[colour for i,colour in enumerate(data['colors']) if i not in hidden]
