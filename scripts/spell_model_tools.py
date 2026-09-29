"""Blender mesh authoring tools for Mossvale's individual spell centerpieces.
Coordinates are metres, Y up and +Z forward. No textures or external dependencies.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
TAU=math.tau
GOLD=(1,.62,.15,1); PEARL=(1,.96,.72,1); SILVER=(.58,.76,.92,1)
GREEN=(.18,.72,.3,1); MINT=(.58,1,.76,1); FIRE=(1,.17,.015,1)
ICE=(.2,.65,1,1); ARCANE=(.48,.16,1,1); DARK=(.055,.08,.11,1)
objects=[]; vertices=[]; faces=[]; colors=[]
def tint(c,k):return tuple(min(1,v*k) for v in c[:3])+(1,)
def mix(a,b,f):return tuple(a[i]*(1-f)+b[i]*f for i in range(4))
def add(v,f,c):
    n=len(vertices);vertices.extend(tuple(p) for p in v);faces.extend(tuple(n+i for i in face) for face in f)
    colors.extend([c]*len(f))
def tube(points,radii,color=PEARL,sides=8):
    ps=[Vector(p) for p in points];radii=[radii]*len(ps) if isinstance(radii,(int,float)) else radii
    vs=[]
    for i,p in enumerate(ps):
        d=(ps[min(i+1,len(ps)-1)]-ps[max(0,i-1)]).normalized();ref=Vector((0,1,0)) if abs(d.y)<.92 else Vector((1,0,0));a=d.cross(ref).normalized();b=d.cross(a).normalized()
        for j in range(sides):vs.append(p+(a*math.cos(j*TAU/sides)+b*math.sin(j*TAU/sides))*radii[i])
    n=len(vertices);vertices.extend(tuple(p) for p in vs)
    for i in range(len(ps)-1):
        for j in range(sides):faces.append((n+i*sides+j,n+i*sides+(j+1)%sides,n+(i+1)*sides+(j+1)%sides,n+(i+1)*sides+j));colors.append(tint(color,.64+.36*max(0,math.cos(j*TAU/sides-1))))
    faces.extend([tuple(n+j for j in reversed(range(sides))),tuple(n+(len(ps)-1)*sides+j for j in range(sides))]);colors.extend([tint(color,.7),color])
def ribbon(points,widths,color=PEARL,axis=(0,1,0)):
    ps=[Vector(p) for p in points];widths=[widths]*len(ps) if isinstance(widths,(int,float)) else widths;vs=[]
    for i,p in enumerate(ps):
        d=(ps[min(i+1,len(ps)-1)]-ps[max(i-1,0)]).normalized();side=d.cross(Vector(axis)).normalized()
        if side.length<.1:side=Vector((1,0,0))
        vs.extend([p-side*widths[i]*.5,p+side*widths[i]*.5])
    add(vs,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(ps)-1)],color)
def crystal(start,end,radius,color=ICE,sides=6):
    a=Vector(start);b=Vector(end);tube([a,a.lerp(b,.2),a.lerp(b,.72),b],[0,radius,radius*.68,0],color,sides)
def ellipsoid(center,size,color=PEARL,segments=12,rings=7):
    x,y,z=center;sx,sy,sz=size;vs=[]
    for i in range(rings+1):
        v=math.pi*i/rings
        for j in range(segments):
            a=j*TAU/segments;vs.append((x+sx*math.sin(v)*math.cos(a),y+sy*math.cos(v),z+sz*math.sin(v)*math.sin(a)))
    n=len(vertices);vertices.extend(vs)
    for i in range(rings):
        for j in range(segments):faces.append((n+i*segments+j,n+i*segments+(j+1)%segments,n+(i+1)*segments+(j+1)%segments,n+(i+1)*segments+j));colors.append(tint(color,.54+.46*max(0,math.cos(j*TAU/segments-.8))*math.sin((i+.5)*math.pi/rings)))
def ring(center,radius,thickness,color=GOLD,normal='y',segments=28):
    x,y,z=center
    pts=[(x+radius*math.cos(i*TAU/segments),y,z+radius*math.sin(i*TAU/segments)) if normal=='y' else (x+radius*math.cos(i*TAU/segments),y+radius*math.sin(i*TAU/segments),z) if normal=='z' else (x,y+radius*math.cos(i*TAU/segments),z+radius*math.sin(i*TAU/segments)) for i in range(segments+1)]
    tube(pts,thickness,color,6)
def plate(points,depth,color=GOLD):
    # Extruded XY polygon with Z thickness; hand-authored front and darker edge facets.
    n=len(points);front=[(p[0],p[1],p[2]+depth*.5) for p in points];back=[(p[0],p[1],p[2]-depth*.5) for p in points]
    add(front+back,[tuple(range(n)),tuple(reversed(range(n,2*n)))],color)
    add(front+back,[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],tint(color,.55))
def box(center,size,color=GOLD):
    x,y,z=center;a,b,c=[v*.5 for v in size];plate([(x-a,y-b,z),(x+a,y-b,z),(x+a,y+b,z),(x-a,y+b,z)],c*2,color)
def lathe(center,profile,color=GOLD,sides=24):
    x,y,z=center;vs=[(x+rr*math.cos(j*TAU/sides),y+h,z+rr*math.sin(j*TAU/sides)) for rr,h in profile for j in range(sides)]
    n=len(vertices);vertices.extend(vs)
    for i in range(len(profile)-1):
        for j in range(sides):faces.append((n+i*sides+j,n+i*sides+(j+1)%sides,n+(i+1)*sides+(j+1)%sides,n+(i+1)*sides+j));colors.append(tint(color,.48+.52*max(0,math.cos(j*TAU/sides-.6))))
def flame(center,size=(1,1,1),color=FIRE,lean=.3):
    x,y,z=center;sx,sy,sz=size
    for side in [-1,0,1]:
        h=1 if side==0 else .7;points=[(x+side*sx*.16,y-sy*.45,z),(x+side*sx*.22,y-sy*.2,z+sz*.08),(x+side*sx*.13+lean*sx*.18,y+sy*.1*h,z-sz*.1),(x+lean*sx*.4+side*sx*.1,y+sy*.5*h,z)]
        tube(points,[.015,sx*.19,sx*.09,0],color,7)
    tube([(x,y-sy*.32,z+sz*.1),(x+lean*sx*.1,y-sy*.02,z+sz*.1),(x+lean*sx*.22,y+sy*.22,z+sz*.04)],[sx*.1,sx*.065,0],PEARL,6)
def leaf(start,end,width,color=GREEN):
    a=Vector(start);b=Vector(end);d=b-a;side=d.cross(Vector((0,0,1))).normalized()
    if side.length<.1:side=d.cross(Vector((0,1,0))).normalized()
    mid=a.lerp(b,.5);ridge=mid+Vector((0,0,.05));add([a,mid-side*width,b,mid+side*width,ridge],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],color)
    tube([a,ridge,b],[.018,.012,.001],tint(color,1.4),4)

def forest_color(hex):
    # Match the linear vertex palettes in wild-pets and Verdant Revenant.
    channels=[int(hex[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in channels)+(1,)

def stepped_solid(center,size,color,detail=6):
    """The companions' stepped solid, merged into one mesh instead of separate cubes."""
    unit=max(size)*2/detail
    dims=[max(1,math.ceil(r*2/unit)) for r in size]
    cells={(x,y,z) for x in range(dims[0]) for y in range(dims[1]) for z in range(dims[2])
           if sum(((value+.5)*2/count-1)**2 for value,count in zip((x,y,z),dims))<=1}
    vs=[];fs=[]
    for axis in range(3):
        u=(axis+1)%3;v=(axis+2)%3
        for direction in (-1,1):
            for layer in range(dims[axis]):
                mask=set()
                for cell in cells:
                    if cell[axis]!=layer:continue
                    neighbor=list(cell);neighbor[axis]+=direction
                    if tuple(neighbor) not in cells:mask.add((cell[u],cell[v]))
                while mask:
                    x,y=min(mask,key=lambda p:(p[1],p[0]));w=1;h=1
                    while (x+w,y) in mask:w+=1
                    while all((x+i,y+h) in mask for i in range(w)):h+=1
                    mask.difference_update((x+i,y+j) for i in range(w) for j in range(h))
                    first=len(vs)
                    for a,b in ((x,y),(x+w,y),(x+w,y+h),(x,y+h)):
                        p=[0,0,0];p[axis]=layer+(direction>0);p[u]=a;p[v]=b
                        vs.append(tuple(center[j]+(p[j]*2/dims[j]-1)*size[j] for j in range(3)))
                    fs.append(tuple(first+i for i in ((0,1,2,3) if direction>0 else (3,2,1,0))))
    add(vs,fs,color)

def carved_leaf(start,end,width,color,thickness=.018,normal=(0,0,1)):
    """Six overlapping block courses: the wild pets' leaf, feather and scale profile."""
    a=Vector(start);b=Vector(end);d=b-a;side=d.cross(Vector(normal)).normalized()*width/2
    if side.length<.0001:side=d.cross(Vector((0,1,0))).normalized()*width/2
    n=side.cross(d).normalized()*thickness
    for i,profile in enumerate((.42,.72,1,.88,.58,.25)):
        center=a+d*(i+.5)/6
        vs=[center+side*x*profile+d*y/12+n*z for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        add(vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],color)

def finish_forest(id):
    obj=finish(id)
    mat=bpy.data.materials.get('Forest spell carving')
    if not mat:
        mat=bpy.data.materials.new('Forest spell carving');mat.use_nodes=True
        shader=mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Roughness'].default_value=.68;shader.inputs['Metallic'].default_value=.16
        shader.inputs['Emission Strength'].default_value=.12
        vertex=mat.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name='SpellColor'
        mat.node_tree.links.new(vertex.outputs['Color'],shader.inputs['Base Color'])
        mat.node_tree.links.new(vertex.outputs['Color'],shader.inputs['Emission Color'])
    obj.data.materials.clear();obj.data.materials.append(mat)
    obj['style']='Mossvale creature carving: stepped relief, jade, bark, aged brass'
    return obj
def reset():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    objects.clear()
def finish(id):
    global vertices,faces,colors
    mesh=bpy.data.meshes.new('fx_'+id);mesh.from_pydata([(x,-z,y) for x,y,z in vertices],[],faces);mesh.update()
    attr=mesh.color_attributes.new(name='SpellColor',type='FLOAT_COLOR',domain='CORNER')
    for poly,c in zip(mesh.polygons,colors):
        for idx in poly.loop_indices:attr.data[idx].color=c
    obj=bpy.data.objects.new('fx_'+id,mesh);bpy.context.collection.objects.link(obj)
    mat=bpy.data.materials.get('Spell radiant surface')
    if not mat:
        mat=bpy.data.materials.new('Spell radiant surface');mat.use_nodes=True;nodes=mat.node_tree.nodes;shader=nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.3;shader.inputs['Metallic'].default_value=.2;shader.inputs['Emission Strength'].default_value=.8;vertex=nodes.new('ShaderNodeVertexColor');vertex.layer_name='SpellColor';mat.node_tree.links.new(vertex.outputs['Color'],shader.inputs['Base Color']);mat.node_tree.links.new(vertex.outputs['Color'],shader.inputs['Emission Color'])
    mesh.materials.append(mat);objects.append(obj);vertices=[];faces=[];colors=[];return obj
def export(classname):
    root=ROOT/'assets/source';root.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    path=ROOT/f'public/models/spell-models-{classname}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_texcoords=False,export_normals=True,export_cameras=False,export_lights=False)
    for i,o in enumerate(objects):o.location=(i%6*4,i//6*4,0)
    scene=bpy.context.scene;scene.world.color=(.018,.023,.04);scene.render.engine='CYCLES';scene.cycles.samples=24
    bpy.ops.wm.save_as_mainfile(filepath=str(root/f'spell-models-{classname}.blend'))
    print(json.dumps({'class':classname,'models':len(objects),'vertices':sum(len(o.data.vertices) for o in objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'bytes':path.stat().st_size}))
