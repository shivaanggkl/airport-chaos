"""Editable Giant Transport asset. blender -b --python scripts/prepare-giant-transport.py.
Blender +Y nose, +Z up exports to game -Z nose, +Y up. No gameplay constants.
"""
import bpy, math, json, bmesh
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'assets/giant-transport'; RUNTIME=ROOT/'client/public/assets/models/enemies'
OUT.mkdir(parents=True,exist_ok=True);RUNTIME.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# A non-repeating atlas with a few deliberately placed structural seams.
N=1024;image=bpy.data.images.new('Transport authored panel atlas',width=N,height=N)
STEEL=(.58,.62,.67);UNDER=(.40,.43,.47);GLASS=(.018,.035,.055)
pixels=[*STEEL,1.]*(N*N)
def pixel(x,y,color):
 if 0<=x<N and 0<=y<N:
  i=(y*N+x)*4;pixels[i:i+3]=color
def hull_uv(y,angle,sign=1):
 theta=math.pi/2-sign*angle
 return (.04+(y+22)/44*.92,.04+(theta%(2*math.pi))/(2*math.pi)*.50)
# The underside is paint in the same skin UV, not an overlapping black patch.
for y in range(N):
 v=y/(N-1)
 if .04<=v<=.54 and math.sin((v-.04)/.5*2*math.pi)<-.62:
  for x in range(int(N*.04),int(N*.96)):pixel(x,y,UNDER)
def line(u0,v0,u1,v1,tone=.91):
 x0,y0,x1,y1=[int(v*(N-1)) for v in (u0,v0,u1,v1)];steps=max(abs(x1-x0),abs(y1-y0),1)
 for k in range(steps+1):
  x=round(x0+(x1-x0)*k/steps);y=round(y0+(y1-y0)*k/steps)
  if 0<=x<N and 0<=y<N:
   i=(y*N+x)*4;pixel(x,y,tuple(v*tone for v in pixels[i:i+3]))
def polygon(points,color):
 points=[(u*(N-1),v*(N-1)) for u,v in points]
 def inside(x,y):
  hit=False
  for a,b in zip(points,points[1:]+points[:1]):
   if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:hit=not hit
  return hit
 for y in range(max(0,int(min(v for u,v in points))),min(N,int(max(v for u,v in points))+2)):
  for x in range(max(0,int(min(u for u,v in points))),min(N,int(max(u for u,v in points))+2)):
   coverage=sum(inside(x+(i+.5)/4,y+(j+.5)/4) for i in range(4) for j in range(4))/16
   if coverage:
    k=(y*N+x)*4;pixel(x,y,tuple(pixels[k+i]*(1-coverage)+color[i]*coverage for i in range(3)))
# Compact cockpit panels are mapped directly onto the body: no floating layers.
WINDOWS=[[(17.20,.045),(17.27,.35),(19.24,.32),(19.40,.045)],[(17.18,.39),(16.92,.64),(18.75,.59),(19.18,.36)],[(16.85,.68),(16.48,.86),(18.10,.82),(18.70,.63)]]
WINDOWS=[[(y,angle*.75) for y,angle in panel] for panel in WINDOWS]
for sign in (-1,1):
 for panel in WINDOWS:
  outline=[hull_uv(y,a,sign) for y,a in panel];polygon(outline,(.66,.70,.74))
  cy=sum(q[0] for q in outline)/4;cv=sum(q[1] for q in outline)/4
  inset=[(cy+(u-cy)*.88,cv+(v-cv)*.84) for u,v in outline];polygon(inset,GLASS)
# Sparse structural rings and access panels, without a repeating grid.
for y in (-13,0,10):
 u=.04+(y+22)/44*.92;line(u,.045,u,.54,.95)
for v in (.10,.205,.405):line(.11,v,.85,v,.96)
for u,v,w,h in [(.38,.205,.045,.052),(.69,.205,.028,.046)]:
 for a,b,c,d in [(u,v,u+w,v),(u+w,v,u+w,v+h),(u+w,v+h,u,v+h),(u,v+h,u,v)]:line(a,b,c,d,.90)
# Closed cargo ramp outline follows the actual lower aft surface.
for sign in (-1,1):
 outline=[hull_uv(y,a,sign) for y,a in [(-21.5,2.48),(-17.0,2.55),(-17.0,3.10),(-21.5,3.10)]]
 for a,b in zip(outline,outline[1:]+outline[:1]):line(*a,*b,.76)
line(.03,.78,.47,.78,.93)
for u in (.13,.29,.41):line(u,.62,u,.79,.96)
for u in (.66,.89):line(u,.60,u,.96,.95)
for a,b,c,d in [(.73,.72,.81,.72),(.81,.72,.81,.78),(.81,.78,.73,.78),(.73,.78,.73,.72)]:line(a,b,c,d,.94)
for y in range(int(N*.97),N):
 for x in range(int(N*.97),N):pixel(x,y,(.28,.31,.36))
# A planar end-cap UV island keeps the paint boundary straight on the closed rear.
for y in range(int(N*.545),int(N*.596)):
 for x in range(int(N*.56),int(N*.94)):
  pixel(x,y,UNDER if y/(N-1)<.5545 else STEEL)
# Restrained closed-ramp frame on the planar rear cap.
outline=[(.75+.19*x,.570+.025*z) for x,z in [(-.68,.45),(.68,.45),(.85,-.50),(-.85,-.50)]]
for a,b in zip(outline,outline[1:]+outline[:1]):line(*a,*b,.72)
image.pixels.foreach_set(pixels);image.filepath_raw=str(OUT/'transport-panels.png');image.file_format='PNG';image.save();image.pack()
def material(name,color,rough,metal=0,texture=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.use_backface_culling=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if texture:
  tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
  m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
 return m
M=[material('Steel gray panels',(.40,.46,.52),.52,.18,True),material('Charcoal underside and machinery',(.038,.049,.065),.7,.12),material('Mapped cockpit glazing',(.58,.62,.67),.26,.18,True),material('Crimson accents',(.40,.014,.027),.4,.12)]
def empty(name,parent,location=(0,0,0)):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;o.location=location;return o
def mesh(name,vs,fs,mat=0,parent=None,uvs=None,smooth=True):
 data=bpy.data.meshes.new(name);data.from_pydata(vs,[],fs);data.update();o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.parent=parent
 for m in M:data.materials.append(m)
 for p in data.polygons:p.material_index=mat;p.use_smooth=smooth
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 uv=data.uv_layers.new(name='Panels')
 for p in data.polygons:
  for li in p.loop_indices:
   vi=data.loops[li].vertex_index;v=data.vertices[vi].co
   uv.data[li].uv=uvs[vi] if uvs else (.51,.99)
 return o
# Smooth interpolated transport sections: aft upsweep, broad cargo body, shaped forehead/nose.
PROFILE=[(-22,2.10,1.80,1.20),(-21,2.50,2.40,.70),(-19,3.30,3.20,.35),(-16,4.10,3.80,.05),(-10,4.65,4.2,-.15),(-4,4.85,4.25,-.15),(5,4.85,4.30,-.10),(10,4.7,4.35,.05),(13,4.45,4.35,.12),(16,4.10,4.10,.25),(18,3.75,3.5,.20),(20,2.80,2.60,.10),(21.2,1.70,1.65,.08),(21.8,.80,.80,.06),(22,.10,.12,.05)]
def profile(y):
 for i in range(len(PROFILE)-1):
  a,b=PROFILE[i:i+2]
  if a[0]<=y<=b[0]:
   t=(y-a[0])/(b[0]-a[0]);r=[]
   for j in range(1,4):
    va,vb=a[j],b[j];pa=PROFILE[max(0,i-1)];nb=PROFILE[min(len(PROFILE)-1,i+2)]
    ma=(b[j]-pa[j])/(b[0]-pa[0])*(b[0]-a[0]);mb=(nb[j]-a[j])/(nb[0]-a[0])*(b[0]-a[0]);r.append((2*t**3-3*t*t+1)*va+(t**3-2*t*t+t)*ma+(-2*t**3+3*t*t)*vb+(t**3-t*t)*mb)
   return r
 return PROFILE[-1][1:]
def fuselage(root,ny,nc):
 vs=[];uv=[]
 for j in range(ny+1):
  y=-22+44*j/ny;rx,rz,cz=profile(y)
  for k in range(nc):
   a=2*math.pi*k/nc;vs.append((rx*math.cos(a),y,cz+rz*math.sin(a)));uv.append((.04+(y+22)/44*.92,.04+k/nc*.50))
 fs=[]
 for j in range(ny):
  for k in range(nc):fs.append((j*nc+k,j*nc+(k+1)%nc,(j+1)*nc+(k+1)%nc,(j+1)*nc+k))
 for end in (0,ny):
  y=-22+44*end/ny;rx,rz,cz=profile(y);first=len(vs)
  vs.append((0,y,cz));uv.append((.75,.570))
  for k in range(nc):
   x,_,z=vs[end*nc+k];vs.append((x,y,z));uv.append((.56+.38*(x/rx*.5+.5),.545+.05*((z-cz)/rz*.5+.5)))
  for k in range(nc):fs.append((first,first+1+k,first+1+(k+1)%nc) if end else (first,first+1+(k+1)%nc,first+1+k))
 o=mesh('Airframe',vs,fs,parent=root,uvs=uv)
 # Keep the radial UV seam discontinuous per corner while geometry stays welded.
 for face in o.data.polygons:
  if face.index<ny*nc and face.index%nc==nc-1:
   for li in face.loop_indices:
    if o.data.loops[li].vertex_index%nc==0:o.data.uv_layers.active.data[li].uv.y=.54
 # A skin material uses the atlas for paint and glazing. Curvature and UVs are
 # shared across LODs, eliminating window/skin depth fighting entirely.
 for p in o.data.polygons:
  c=p.center
  if 16.1<c.y<19.2 and c.z>2.3:p.material_index=2
 return o
# Closed, smooth airfoil volume. Controls shape directly rather than stacking boxes.
def foil(name,root,stations,ns,nt,vertical=False):
 vs=[];fs=[];uvs=[]
 for i in range(ns+1):
  u=i/ns*(len(stations)-1);a=stations[min(int(u),len(stations)-2)];b=stations[min(int(u)+1,len(stations)-1)];t=u-min(int(u),len(stations)-2);q=[a[k]*(1-t)+b[k]*t for k in range(5)];span,le,chord,z,th=q
  for side in (1,-1):
   for j in range(nt+1):
    v=j/nt;thick=5*th*chord*(.2969*math.sqrt(v)-.126*v-.3516*v*v+.2843*v**3-.1036*v**4);point=(span,le-chord*v,z+side*thick)
    if vertical:point=(side*thick,le-chord*v,span)
    vs.append(point);uvs.append((.03+abs(span)/24*.44,.62+v*.18) if not vertical else (.51,.99))
 stride=2*(nt+1)
 for i in range(ns):
  for side in (0,1):
   for j in range(nt):
    a=i*stride+side*(nt+1)+j;fs.append((a,a+1,a+stride+1,a+stride))
  for edge in (0,nt):
   a=i*stride+edge;b=a+nt+1;fs.append((a,b,b+stride,a+stride))
 for end in (0,ns):
  for j in range(nt):
   a=end*stride+j;b=a+nt+1;fs.append((a,a+1,b+1,b))
 o=mesh(name,vs,fs,parent=root,uvs=uvs)
 if 'Wing' in name:
  for p in o.data.polygons:
   if abs(p.center.x)>22.6:p.material_index=3
 return o
def wing_root_fairing(root,level):
 # One continuous roof/shoulder fairing. Its buried ends blend into the cargo
 # shell; the broad upper shoulders seat inside the high wing, without flaps.
 stations=[(-6,2.0,.40,3.50),(-3,5.7,.55,3.55),(0,6.0,.65,3.50),(3,6.0,.65,3.50),(5,4.5,.55,3.50),(7,2.0,.35,3.65)]
 ny,nc=(16,20) if level=='near' else (10,14) if level=='mid' else (5,8)
 vs=[];fs=[]
 for j in range(ny+1):
  y=-6+13*j/ny
  for a,b in zip(stations,stations[1:]):
   if a[0]<=y<=b[0]:
    t=(y-a[0])/(b[0]-a[0]);rx,rz,cz=[a[k]*(1-t)+b[k]*t for k in (1,2,3)];break
  for k in range(nc):
   theta=k*2*math.pi/nc;vs.append((rx*math.cos(theta),y,cz+rz*math.sin(theta)))
 for j in range(ny):
  for k in range(nc):fs.append((j*nc+k,j*nc+(k+1)%nc,(j+1)*nc+(k+1)%nc,(j+1)*nc+k))
 fs.extend([tuple(reversed(range(nc))),tuple(ny*nc+k for k in range(nc))]);mesh('WingRootFairing',vs,fs,0,root)
def shell(name,parent,rings,nc,mat=0):
 vs=[];fs=[];uvs=[]
 for y,r,z,x in rings:
  for k in range(nc):
   a=2*math.pi*k/nc;vs.append((x+r*math.cos(a),y,z+r*math.sin(a)));uvs.append((.56+(y-min(q[0] for q in rings))/max(.01,max(q[0] for q in rings)-min(q[0] for q in rings))*.40,.60+k/nc*.36))
 for i in range(len(rings)-1):
  for k in range(nc):fs.append((i*nc+k,i*nc+(k+1)%nc,(i+1)*nc+(k+1)%nc,(i+1)*nc+k))
 o=mesh(name,vs,fs,mat,parent,uvs=uvs)
 for face in o.data.polygons:
  if face.index%nc==nc-1:
   for li in face.loop_indices:
    if o.data.loops[li].vertex_index%nc==0:o.data.uv_layers.active.data[li].uv.y=.96
 return o
def engine(root,index,x,front,nc):
 z=.15;L=6.4
 # An annular inlet folds into a shallow dark cavity; engine has an actual lip.
 rings=[(front-L+.7,.68,z,x),(front-L,.85,z,x),(front-L-.08,.95,z,x),(front-L,1.03,z,x),(front-L+.4,1.27,z,x),(front-4.6,1.66,z,x),(front-2.8,1.78,z,x),(front-.7,1.76,z,x),(front-.18,1.72,z,x),(front+.02,1.64,z,x),(front+.10,1.53,z,x),(front+.04,1.40,z,x),(front-.16,1.32,z,x),(front-1.25,1.28,z,x)]
 nacelle=shell(f'Engine_{index}_Nacelle',root,rings,nc)
 for p in nacelle.data.polygons:
  if p.index<3*nc:p.material_index=1
 shell(f'Engine_{index}_Intake',root,[(front-1.23,1.28,z,x),(front-1.65,1.23,z,x)],nc,1)
 # Rear nozzle and shallow back face.
 for y,r in [(front-1.66,1.23),(front-L+.71,.68)]:
  vs=[(x,y,z)]+[(x+r*math.cos(k*2*math.pi/nc),y,z+r*math.sin(k*2*math.pi/nc)) for k in range(nc)];cavity=mesh(f'Engine_{index}_Cavity',vs,[(0,k+1,(k+1)%nc+1) for k in range(nc)],1,root)
  bm=bmesh.new();bm.from_mesh(cavity.data);bm.normal_update();direction=1 if y==front-1.66 else -1
  for f in bm.faces:
   if f.normal.y*direction<0:f.normal_flip()
  bm.to_mesh(cavity.data);bm.free()
 fan=empty(f'EngineFan_{index}',root,(x,front-1.40,z));vs=[];fs=[]
 fan_count=min(20,max(8,nc//2))
 for k in range(fan_count):
  a=k*2*math.pi/fan_count;v=[]
  for r,bend in [(.24,0),(1.17,.17),(1.17,.30),(.24,.13)]:v.append((r*math.cos(a+bend),.025*(r-.2),r*math.sin(a+bend)))
  j=len(vs);vs+=v;fs.append((j+3,j+2,j+1,j))
 blades=mesh(f'FanBlades_{index}',vs,fs,0,fan,uvs=[(.99,.99)]*len(vs),smooth=False)
 bm=bmesh.new();bm.from_mesh(blades.data);bm.normal_update()
 for f in bm.faces:
  if f.normal.y<0:f.normal_flip()
 bm.to_mesh(blades.data);bm.free();blades.data.update()
 shell(f'FanHub_{index}',fan,[(.1,.02,0,0),(.06,.19,0,0),(-.13,.25,0,0)],max(12,nc//2),1)
 # Aerodynamic pylon intersects the wing's underside and engine crown cleanly.
 # closed profile at two span positions, deliberately tapered.
 pylon=foil(f'Pylon_{index}',root,[(1.83,front-2.8,2.3,0,.13),(3.0,front-3.1,2.45,0,.11),(4.02,front-3.6,2.6,0,.075)],2,max(3,nc//12),True)
 for v in pylon.data.vertices:v.co.x+=x

 empty(f'EngineSmoke_{index}',root,(x,front-L,z));empty(f'EngineDamage_{index}',root,(x,front-2,z))

def gun(root,nc):
 # A roof-conforming boat-shaped fairing carries the aiming mechanism.
 rings=[(-16.8,.10,3.45,0),(-17.25,.68,3.50,0),(-18.0,.95,3.53,0),(-19.2,.72,3.55,0),(-20.0,.18,3.50,0)]
 mount=shell('RearGunFairing',root,rings,max(10,nc),0)
 bm=bmesh.new();bm.from_mesh(mount.data);caps=bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=nc)['faces'];layer=bm.loops.layers.uv.active
 for face in caps:
  for loop in face.loops:loop[layer].uv=(.51,.99)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mount.data);bm.free()
 vs=[];fs=[];n=max(8,nc//2)
 for z,r in [(4.10,.70),(4.42,.58),(4.69,.48)]:
  for k in range(n):vs.append((r*math.cos(k*2*math.pi/n),-18.6+r*math.sin(k*2*math.pi/n),z))
 for j in range(2):
  for k in range(n):fs.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
 fs.extend([tuple(reversed(range(n))),tuple(2*n+k for k in range(n))]);mesh('RearGunTrunnion',vs,fs,0,root)
 yaw=empty('RearGunYaw',root,(0,-18.6,4.7));pitch=empty('RearGunPitch',yaw,(0,0,0))
 rings=[(.75,.05,0,0),(.50,.47,0,0),(-.30,.51,0,0),(-.65,.38,0,0)]
 housing=shell('RearGunHousing',pitch,rings,nc,0)
 for v in housing.data.vertices:v.co.x*=1.35;v.co.z*=.82
 bm=bmesh.new();bm.from_mesh(housing.data);caps=bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=nc)['faces']
 layer=bm.loops.layers.uv.active
 for f in caps:
  f.smooth=False
  for loop in f.loops:loop[layer].uv=(.51,.99)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(housing.data);bm.free()
 shell('RearGunBarrel',pitch,[(-.55,.15,0,0),(-2.0,.13,0,0),(-2.10,.075,0,0)],max(8,nc//2),1)
 empty('RearGunMuzzle',pitch,(0,-2.13,0));empty('RearGunUpgrade',root,(0,-18.6,4.7))
def join_static(root):
 obs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent==root];bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();o=obs[0];o.name='TransportHull'
 # Keep only the four shared material slots, even after joining.
 indices=[M.index(o.data.materials[p.material_index]) for p in o.data.polygons];o.data.materials.clear()
 for m in M:o.data.materials.append(m)
 for p,i in zip(o.data.polygons,indices):p.material_index=i
 return o
counts=[];previous_objects=[];previous_level=None
for level,ny,nc,ns,nt in [('near',64,48,18,17),('mid',32,26,10,9),('far',16,14,4,3)]:
 for old in previous_objects:
  if not old.name.startswith('GiantTransport_'):old.name+='_'+previous_level
 root=empty('GiantTransport_'+level,None);root['assetRole']='Enemy transport preview only';root['forward']='-Z after glTF export';root['previewScale']=1.0
 fuselage(root,ny,nc);wing_root_fairing(root,level)
 for sign in (-1,1):
  foil('Wing',root,[(0,6,10,4.05,.11),(sign*3.5,5.4,9.5,4.15,.105),(sign*12,1.6,6.5,4.3,.09),(sign*24,-3.4,2.7,4.1,.08)],ns,nt)
  foil('HorizontalTail',root,[(0,-15.8,5.0,11.9,.1),(sign*4,-16.4,4.4,11.98,.09),(sign*10,-18.4,2.7,12.1,.08)],max(4,ns//2),nt)
 fin_stations=[(2.6,-12.7,8.5,0,.085)]+[(z,-13.6-(z-6)*.4,6.8-(z-6)/3,0,.075-(z-6)*.0025) for z in (6,7.8,8.2,8.65,9.05,12)]
 fin=foil('VerticalFin',root,fin_stations,max(6,math.ceil(ns/6)*6),nt,True)
 for p in fin.data.polygons:
  if 7.8<p.center.z<8.2 or 8.65<p.center.z<9.05:p.material_index=3
 for i,(x,y) in enumerate([(-8.5,6.8),(8.5,6.8),(-17,4.2),(17,4.2)]):engine(root,i,x,y,10 if level=='far' else nc)
 gun(root,max(12,nc//2));join_static(root)
 for name,loc in [('Damage_Fuselage',(0,0,1)),('Damage_Tail',(0,-16,6)),('Upgrade_Dorsal',(0,-3,3.5)),('Upgrade_Ventral',(0,-2,-3.2)),('CargoRamp',(0,-19,-.2))]:empty(name,root,loc)
 obs=[root]+list(root.children_recursive);tris=0
 for o in obs:
  if o.type=='MESH':o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
 lo=Vector((1e9,1e9,1e9));hi=-lo
 for o in obs:
  if o.type=='MESH':
   for v in o.data.vertices:
    p=o.matrix_world@v.co
    for j in range(3):lo[j]=min(lo[j],p[j]);hi[j]=max(hi[j],p[j])
 # Ensure transforms evaluated before export/bounds.
 bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=root
 dest=RUNTIME/f'giant-transport-{level}.glb';bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_materials='EXPORT')
 counts.append({'lod':level,'triangles':tris,'glbBytes':dest.stat().st_size});previous_objects=obs;previous_level=level
for o in bpy.context.scene.objects:
 if o.name.startswith('GiantTransport_') and not o.name.endswith('near'):
  for child in [o]+list(o.children_recursive):child.hide_set(True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'giant-transport.blend'))
(OUT/'build-metrics.json').write_text(json.dumps({'lods':counts,'materials':4,'texture':{'size':[N,N],'file':'transport-panels.png'},'previewScale':1,'nominalDimensions':{'span':48,'length':44,'height':16.5}},indent=2))
print('TRANSPORT_METRICS',json.dumps(counts))
