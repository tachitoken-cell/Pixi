"""Mossvale construction vocabulary: planar masses and legible crafted layers."""
_round_orb=orb
def chamfer(tint,x,y,z,w,h,d,cut=.12):
 cx=min(w*.25,cut,.025);cy=min(h*.25,cut,.025);cz=min(d*.25,cut,.025)
 # An eight-sided face profile gives real bevel edges without changing draw calls.
 outline=[(-w/2+cx,-h/2), (w/2-cx,-h/2),(w/2,-h/2+cy),(w/2,h/2-cy),(w/2-cx,h/2),(-w/2+cx,h/2),(-w/2,h/2-cy),(-w/2,-h/2+cy)]
 vertices=[(x+a,y+b,z+c) for c in [-d/2,d/2] for a,b in outline]
 polygon(tint,vertices,[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)])
VOXEL_ANATOMY={'ember-imp','slag-elemental','crypt-weaver','broodmother-vex','slag-crawler','bone-rat','corpse-scarab','mire-leech','crypt-bat','carrion-hound','sewer-horror','cinder-hound','forge-spider','ash-drake','grave-fox','mist-crane','jade-lion','spirit-koi'}
_round_rod=rod
def rod(tint,a,b,r1,r2=None,n=8):
 if current in ('left-arm','right-arm','left-leg','right-leg','left-leg-shin','right-leg-shin') or active in VOXEL_ANATOMY and (current.startswith(('leg-','tail','tentacle-','left-leg','right-leg','left-wing','right-wing')) or tint in ('bone','flesh','plague','moss','ivory','suture','jade','jadelight','jadedark','silk')):
  # Rectangular limbs, tails, veins and feathers use the same articulated endpoints.
  a=Vector(a);b=Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,1,0)))
  if u.length<.01:u=axis.cross(Vector((1,0,0)))
  u.normalize();v=axis.cross(u);r2=r1 if r2 is None else r2
  vertices=[p+u*r*x+v*r*y for p,r in [(a,r1),(b,r2)] for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
  polygon(tint,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
 else:_round_rod(tint,a,b,r1,r2,n)
def orb(tint,x,y,z,rx,ry,rz,n=10,rings=6):
 # User art direction is literal voxels: primary anatomy is cuboid, never a low-poly ellipsoid.
 if active in VOXEL_ANATOMY or max(rx,ry,rz)>.24 and min(rx,ry,rz)>.12:
  box(tint,x,y,z,rx*2,ry*2,rz*2)
 else:_round_orb(tint,x,y,z,rx,ry,rz,n,rings)
def eye(x,y,z,r=.06,color='venom'):
 box('ink',x,y,z,r*3.0,r*2.2,r*.72)
 box(color,x,y+.045*r,z+r*.43,r*1.85,r*1.4,r*.30)
 box('ivory',x-r*.36,y+r*.34,z+r*.62,r*.48,r*.43,r*.14)
 box('iron',x,y+r*1.1,z-r*.02,r*3.1,r*.25,r*.82)
def plate(tint,trim,x,y,z,w,h,d,cut=.10):
 chamfer(trim,x,y,z,w,h,d,cut)
 chamfer(tint,x,y,z+d*.51,w-.06,h-.06,.038,min(cut,.07))
def stud(tint,x,y,z,r=.035):
 chamfer(tint,x,y,z,r*2,r*2,r*.9,r*.36)
def strap(tint,trim,a,b,width=.12):
 a=Vector(a);b=Vector(b);axis=b-a;length=axis.length;direction=axis.normalized();side=direction.cross(Vector((0,0,1)))
 if side.length<.1:side=Vector((1,0,0))
 side.normalize();normal=side.cross(direction).normalized()
 corners=[a-side*width/2-normal*.015,a+side*width/2-normal*.015,b+side*width/2-normal*.015,b-side*width/2-normal*.015,a-side*width/2+normal*.015,a+side*width/2+normal*.015,b+side*width/2+normal*.015,b-side*width/2+normal*.015]
 polygon(tint,corners,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
 mid=a.lerp(b,.60)+normal*.02
 for s in [-1,1]:rod(trim,mid+side*width*.65+s*direction*.065,mid-side*width*.65+s*direction*.065,.014,n=4)
 for s in [-1,1]:rod(trim,mid+side*width*.65*s-direction*.065,mid+side*width*.65*s+direction*.065,.014,n=4)
 for i in range(max(2,int(length/.13))):
  p=a.lerp(b,(i+.3)/max(2,int(length/.13)))+normal*.019
  for s in [-1,1]:rod('bone',p+side*s*width*.32-direction*.018,p+side*s*width*.32+direction*.018,.007,n=4)
