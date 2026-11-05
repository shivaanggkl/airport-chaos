"""Author Armored Apex from approved reference. Blender 4+, no downloaded model.
Continuous organic sculpt, UV skin maps, clumped fur, fitted armor and a skinned rig.
Run: Blender -b --python scripts/build-armored-apex.py
"""
import bpy, math, random, json, os
from pathlib import Path
from mathutils import Vector
import numpy as np
random.seed(20)
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'assets/armored-apex'; OUT.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def v(p):return Vector((p[0],-p[2],p[1]))
def mat(name,color,metal=0,rough=.6,emission=None):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 if emission:n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
fur=mat('Blue charcoal dimensional fur',(.035,.049,.077),rough=.9);silver=mat('Silver gray mane',(.20,.23,.28),rough=.88);skin=mat('Gorilla graphite face',(.115,.105,.125),rough=.68);belly=mat('Charcoal chest skin',(.10,.073,.067),rough=.76)
gold=mat('Warm forged gold',(.68,.36,.065),.82,.29);edge=mat('Polished gold bevel',(.98,.64,.16),.84,.23);darkgold=mat('Recessed aged gold',(.20,.105,.028),.75,.42)
ruby=mat('Crimson crystal',(.66,.008,.012),.35,.2,1.1);hot=mat('Orange red energy', (1,.032,.004),.05,.3,3);eye=mat('Glowing red eyes',(1,.001,.0005),.1,.19,1.3);ivory=mat('Warm ivory fangs',(.80,.65,.40),.08,.35);mouth=mat('Deep mouth cavity',(.012,.002,.005),rough=.9);gum=mat('Dark red gums',(.19,.012,.025),rough=.5);tongue=mat('Tongue',(.30,.025,.045),rough=.48);nail=mat('Natural nails',(.29,.21,.14),rough=.45)
# Packed UV image maps: brushed directional fur color, strand normals and roughness.
size=512;y,x=np.mgrid[0:size,0:size];rng=np.random.default_rng(20);noise=rng.random((size,size));strand=np.sin(x*.84+np.sin(y*.045)*2.2)+.4*np.sin(x*2.9+y*.11);grain=np.clip(.45+strand*.13+(noise-.5)*.16,0,1)
def image(name,data,noncolor=False):
 im=bpy.data.images.new(name,width=size,height=size,alpha=True);im.pixels.foreach_set(data.astype(np.float32).ravel());im.filepath_raw=str(OUT/(name+'.png'));im.file_format='PNG';im.save();im.pack()
 if noncolor:im.colorspace_settings.name='Non-Color'
 return im
rgba=np.ones((size,size,4));rgba[:,:,:3]=np.array([.075,.10,.16])[None,None,:]*(.6+grain[:,:,None]*1.1);albedo=image('apex-fur-basecolor',rgba)
normal=np.ones((size,size,4));normal[:,:,0]=.5+.16*np.cos(x*.84+np.sin(y*.045)*2.2);normal[:,:,1]=.5+.035*np.sin(y*.045);normal[:,:,2]=.97;normalmap=image('apex-fur-normal',normal,True)
rough=np.ones((size,size,4));rough[:,:,:3]=(.80+grain*.15)[:,:,None];roughmap=image('apex-fur-roughness',rough,True)
for material in [fur,silver]:
 nodes=material.node_tree.nodes;links=material.node_tree.links;bs=nodes.get('Principled BSDF');tex=nodes.new('ShaderNodeTexImage');tex.image=normalmap;nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.45;links.new(tex.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bs.inputs['Normal']);r=nodes.new('ShaderNodeTexImage');r.image=roughmap;links.new(r.outputs['Color'],bs.inputs['Roughness'])
 if material==fur:
  t=nodes.new('ShaderNodeTexImage');t.image=albedo;links.new(t.outputs['Color'],bs.inputs['Base Color'])
# Mesh construction; primitives are fused/remeshed into the organic sculpt, never runtime stand-ins.
objects=[];skin_objects=[];bone_objects={}
def finish(o,name,material,bone=None,organic=False):
 o.name=name;o.data.materials.clear();o.data.materials.append(material);objects.append(o)
 for p in o.data.polygons:p.use_smooth=True
 if bone:bone_objects[o]=bone
 if organic:skin_objects.append(o)
 return o
def ell(name,p,scale,material,bone=None,organic=False):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=v(p));o=bpy.context.object;o.scale=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,material,bone,organic)
def capsule(name,a,b,r1,r2,material,bone=None,organic=False):
 # Profiled surface between anatomical endpoints, with rounded muscle taper.
 a,b=v(a),v(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
 if u.length<.1:u=axis.cross(Vector((0,1,0)))
 u.normalize();w=axis.cross(u);verts=[];faces=[]
 for j in range(13):
  t=j/12;r=(r1*(1-t)+r2*t)*(.88+.12*math.sin(math.pi*t));c=a.lerp(b,t)
  for i in range(20):verts.append(c+(u*math.cos(i*math.tau/20)+w*math.sin(i*math.tau/20))*r)
 for j in range(12):
  for i in range(20):k=j*20+i;faces.append((k,j*20+(i+1)%20,(j+1)*20+(i+1)%20,k+20))
 faces.extend([tuple(reversed(range(20))),tuple(range(240,260))]);mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);return finish(o,name,material,bone,organic)
def join(items,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in items:o.select_set(True)
 bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join();o=items[0];o.name=name;return o
# Hero silhouette: broad upper torso, long arms, compact powerful lower body.
ell('Thorax',(0,6.75,0),(2.15,2.1,1.12),fur,organic=True);ell('Pelvis',(0,4.35,-.12),(1.4,1.0,.9),fur,organic=True)
ell('Neck',(0,8.15,.04),(1.2,1.15,.9),fur,organic=True)
for s in [-1,1]:
 ell('Trapezius',(s*1.4,7.95,-.06),(1.2,.88,.95),fur,organic=True)
 ell('Deltoid',(s*2.5,7.6,.05),(1.18,1.2,1.1),fur,organic=True)
 capsule('Upper arm',(s*2.65,7.45,.08),(s*3.65,5.7,.42),1.0,.79,fur,organic=True)
 ell('Biceps',(s*3.15,6.52,.65),(.86,1.05,.68),fur,organic=True)
 capsule('Forearm',(s*3.65,5.7,.42),(s*4.1,4.05,.95),.88,.78,fur,organic=True)
 ell('Forearm muscle',(s*3.95,4.9,.71),(.94,1.03,.87),fur,organic=True)
 capsule('Thigh',(s*.95,4.25,-.05),(s*1.42,2.25,.2),1.0,.75,fur,organic=True)
 ell('Quadriceps',(s*1.15,3.25,.45),(.9,1.18,.74),fur,organic=True)
 capsule('Calf',(s*1.42,2.25,.2),(s*1.63,.65,.5),.7,.59,fur,organic=True)
 ell('Calf muscle',(s*1.51,1.45,-.04),(.72,.88,.65),fur,organic=True)
body=join(skin_objects,'Apex organic sculpt');bpy.context.view_layer.objects.active=body
rem=body.modifiers.new('Fused anatomical surface','REMESH');rem.mode='VOXEL';rem.voxel_size=.13;rem.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=rem.name)
sm=body.modifiers.new('Sculpt relaxation','SMOOTH');sm.factor=.8;sm.iterations=4;bpy.ops.object.modifier_apply(modifier=sm.name)
sub=body.modifiers.new('Silhouette refinement','SUBSURF');sub.levels=1;bpy.ops.object.modifier_apply(modifier=sub.name)
opt=body.modifiers.new('Runtime sculpt topology','DECIMATE');opt.ratio=.30;bpy.ops.object.modifier_apply(modifier=opt.name)
# Bare pectorals/abdomen are naturally tucked into the chest harness.
ell('Continuous abdominal wall',(0,5.75,.85),(.93,1.30,.25),belly,'Spine')
for s in [-1,1]:
 ell('Pectoral',(s*.87,7.0,1.0),(1.0,.7,.42),belly,'Chest')
 for k in range(3):ell('Abdominal muscle',(s*.38,6.12-k*.52,1.0),(.44,.34,.14),belly,'Spine')
# Closed, oversized fists with individual curled digits and tucked thumbs.
for s,label in [(-1,'Left'),(1,'Right')]:
 hand=label+'Hand';ell('Fist palm',(s*4.15,3.87,1.02),(.95,.90,.77),fur,hand)
 for k in range(4):
  xx=s*(3.55+k*.39);yy=3.8+(.12 if k in [1,2] else 0)
  ell('Curled finger',(xx,yy,1.59),(.25,.59,.37),skin,hand)
  ell('Finger knuckle',(xx,yy+.39,1.64),(.27,.28,.30),fur,hand)
  capsule('Gold knuckle plate',(xx,yy+.5,1.87),(xx,yy+.18,1.93),.18,.19,gold,hand)
 ell('Thumb',(s*3.45,4.13,1.32),(.38,.65,.42),skin,hand)
 ell('Foot',(s*1.65,.39,.82),(.83,.39,1.02),skin,label+'Foot')
 for k in range(4):
  xx=s*(1.10+k*.35);ell('Toe',(xx,.26,1.57),(.23,.25,.45),skin,label+'Foot');ell('Toenail',(xx,.30,1.92),(.16,.12,.17),nail,label+'Foot')
# Face: continuous brow/muzzle forms with deep open oral cavity, gums and teeth.
ell('Cranium',(0,9.28,.12),(1.12,1.23,.88),fur,'Head')
# A sculpted facial ring has a real mouth opening, not a sphere pasted over the face.
verts=[];faces=[]
for j in range(5):
 t=j/4
 for i in range(40):
  a=i*math.tau/40;rx=.66*(1-t)+.94*t;ry=.67*(1-t)+1.01*t;yy=9.0+.16*t+math.sin(a)*ry;zz=1.50*(1-t)+(.82+.10*abs(math.cos(a)))*t+.10*math.sin(t*math.pi);verts.append(v((math.cos(a)*rx,yy,zz)))
for j in range(4):
 for i in range(40):faces.append((j*40+i,j*40+(i+1)%40,(j+1)*40+(i+1)%40,(j+1)*40+i))
mesh=bpy.data.meshes.new('Sculpted gorilla facial mask');mesh.from_pydata(verts,[],faces);mask=bpy.data.objects.new('Sculpted gorilla facial mask',mesh);bpy.context.collection.objects.link(mask);finish(mask,'Sculpted gorilla facial mask',skin,'Head')

for s in [-1,1]:
 ell('Temple',(s*.86,9.21,.65),(.18,.57,.23),silver,'Head')
 ell('Ear',(s*1.04,9.40,.13),(.24,.37,.18),skin,'Head')
 ell('Eye socket',(s*.46,9.73,1.10),(.31,.18,.14),skin,'Head')
 eye_obj=ell('Red eye',(s*.45,9.74,1.25),(.15,.075,.06),eye,'Head')
 brow=ell('Heavy silver brow',(s*.43,9.94,1.10),(.52,.16,.20),silver,'Head');brow.rotation_euler.y=s*.18
ell('Nasal bridge',(0,9.63,1.17),(.36,.32,.23),skin,'Head');ell('Nose',(0,9.57,1.47),(.40,.22,.18),skin,'Head')
for s in [-1,1]:ell('Nostril',(s*.18,9.56,1.62),(.105,.065,.025),mouth,'Head')
ell('Deep roaring mouth',(0,8.99,1.32),(.66,.69,.28),mouth,'Head')
# Lip/gum arcs and shaped fangs keep the mouth volumetric from the side.
def tube(name,points,r,material,bone):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=2;curve.bevel_depth=r;curve.bevel_resolution=2;spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
 for dst,p in zip(spline.points,points):dst.co=(*v(p),1)
 o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.select_set(False);return finish(o,name,material,bone)
for upper in [True,False]:
 pts=[]
 for i in range(25):
  a=(.10+(.80*i/24))*math.pi if upper else (1.10+.80*i/24)*math.pi
  pts.append((math.cos(a)*.62,9.0+math.sin(a)*.64,1.52))
 tube('Gum line',pts,.075,gum,'Head' if upper else 'Jaw')
for upper in [True,False]:
 for i in range(8):
  xx=-.48+i*.137;yy=9.42 if upper else 8.50;length=.34 if i in [0,7] else .15;tip=yy-length if upper else yy+length
  capsule('Ivory tooth',(xx,yy,1.57),(xx,tip,1.62),.075,.018,ivory,'Head' if upper else 'Jaw')
for s in [-1,1]:capsule('Long upper fang',(s*.47,9.43,1.58),(s*.42,8.96,1.68),.12,.015,ivory,'Head')
ell('Lower jaw',(0,8.46,1.03),(.63,.28,.50),silver,'Jaw');ell('Tongue',(0,8.65,1.45),(.30,.18,.20),tongue,'Jaw')
# Forged plate geometry: raised faceted center, separately beveled metallic rims.
def plate(name,outline,depth,material,bone):
 pts=[v(p) for p in outline];n=len(pts);center=sum(pts,Vector())/n;front=center+Vector((0,-depth,0));verts=pts+[p+Vector((0,depth*.28,0)) for p in pts]+[front];faces=[]
 for i in range(n):faces.append((i,(i+1)%n,2*n));faces.append((i,n+i,n+(i+1)%n,(i+1)%n))
 faces.append(tuple(range(n,2*n)));mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);finish(o,name,material,bone)
 for p in mesh.polygons:p.use_smooth=False
 bevel=o.modifiers.new('Forged edge bevel','BEVEL');bevel.width=.035;bevel.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=bevel.name)
 tube(name+' polished edge',outline+[outline[0]],.035,edge,bone)
 return o
def ribbon(name,a,b,width,depth,material,bone):
 d=Vector((b[0]-a[0],b[1]-a[1]));d.normalize();q=Vector((-d.y,d.x))*width*.5
 return plate(name,[(a[0]+q.x,a[1]+q.y,a[2]),(b[0]+q.x,b[1]+q.y,b[2]),(b[0]-q.x,b[1]-q.y,b[2]),(a[0]-q.x,a[1]-q.y,a[2])],depth,material,bone)
for s,label in [(-1,'Left'),(1,'Right')]:
 for layer in range(2):
  xx=s*(2.57+layer*.17);yy=8.04-layer*.30;outline=[(xx+s*dx,yy+dy,zz+.45) for dx,dy,zz in [(-.95,.10,.86),(-.62,.63,.71),(.20,.73,.54),(1.03,.33,.46),(1.19,-.21,.58),(.72,-.50,.97),(-.24,-.39,1.13),(-.92,-.16,1.02)]];plate('Layered shoulder armor',outline,.20,gold,label+'Shoulder')
  if layer==0:
   for dx,dz,height in [(0,-.05,.95),(.55,-.18,.65)]:
    base=(xx+s*dx,yy+.49,dz);capsule('Crystal gold setting',base,(base[0]+s*.06,base[1]+height*.75,base[2]),.24,.09,darkgold,label+'Shoulder');plate('Red shoulder crystal',[(base[0]-.2,base[1],base[2]-.1),(base[0]+.2,base[1],base[2]-.1),(base[0]+s*.12,base[1]+height,base[2]-.1)],.20,ruby,label+'Shoulder')
 # Curved upper shoulder shell carries the silhouette around the body.
 verts=[];faces=[]
 for j in range(5):
  phi=.12+j*.22
  for i in range(13):
   theta=i*math.tau/12;verts.append(v((s*2.5+1.24*math.sin(phi)*math.cos(theta),7.55+1.3*math.cos(phi),.06+1.25*math.sin(phi)*math.sin(theta))))
 for j in range(4):
  for i in range(12):k=j*13+i;faces.append((k,k+1,k+14,k+13))
 mesh=bpy.data.meshes.new('Convex shoulder cap');mesh.from_pydata(verts,[],faces);cap=bpy.data.objects.new('Convex shoulder cap',mesh);bpy.context.collection.objects.link(cap);finish(cap,'Convex shoulder cap',gold,label+'Shoulder')
 thick=cap.modifiers.new('Plate thickness','SOLIDIFY');thick.thickness=.09;bpy.context.view_layer.objects.active=cap;bpy.ops.object.modifier_apply(modifier=thick.name)
 for dx,length in [(0,1.1),(.55,.75)]:
  cx=s*(2.57+dx);cy=8.7;cz=.05;vs=[v((cx-.20,cy,cz-.20)),v((cx+.20,cy,cz-.20)),v((cx+.20,cy,cz+.20)),v((cx-.20,cy,cz+.20)),v((cx+s*.12,cy+length,cz-.08))];fs=[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(0,3,2,1)]
  mesh=bpy.data.meshes.new('Faceted red crystal');mesh.from_pydata(vs,[],fs);cr=bpy.data.objects.new('Faceted red crystal',mesh);bpy.context.collection.objects.link(cr);finish(cr,'Faceted red crystal',ruby,label+'Shoulder')
 ribbon('V chest harness',(s*2.08,7.91,1.03),(s*.48,6.82,1.43),.48,.16,gold,'Chest')
 ribbon('Lower chest spur',(s*.46,6.77,1.45),(s*.82,6.1,1.14),.20,.10,gold,'Chest')
 # Cuffs embrace the forearm, with an open underside at the elbow.
 for dy in [-.32,.28]:
  p=(s*4.02,4.56+dy,1.0);outline=[(p[0]+s*x,p[1]+y,p[2]+z) for x,y,z in [(-.79,.22,.37),(-.3,.32,.76),(.55,.28,.67),(.91,0,.20),(.62,-.24,.67),(-.32,-.27,.76),(-.82,-.16,.30)]];plate('Forearm bracer',outline,.11,gold,label+'Forearm')
 plate('Knee plate',[(s*1.42-.61,2.55,.78),(s*1.42-.31,2.94,.71),(s*1.42+.35,2.92,.76),(s*1.42+.65,2.49,.81),(s*1.42+.24,2.04,.95),(s*1.42-.31,2.09,.94)],.18,gold,label+'Shin')
 ribbon('Shin guard',(s*1.54,2.16,.84),(s*1.64,.86,1.03),.72,.13,gold,label+'Shin')
 ribbon('Waist guard',(s*1.33,4.71,.79),(s*.35,4.37,1.02),.40,.12,gold,'Pelvis')
# Central six-sided gemstone and its thick gold bezel, exactly one chest gem.
for radius,zz,material in [(.57,1.53,darkgold),(.48,1.70,gold),(.34,1.87,ruby),(.20,2.0,hot)]:
 outline=[(math.sin(i*math.tau/6)*radius,7.12+math.cos(i*math.tau/6)*radius*1.25,zz) for i in range(6)];plate('Central hexagonal chest gem' if material==ruby else 'Gem bevel',outline,.08,material,'Chest')
plate('Waist center', [(-.38,4.68,1.0),(0,4.9,1.03),(.38,4.68,1.0),(.29,3.93,1.1),(0,3.65,1.1),(-.29,3.93,1.1)],.12,gold,'Pelvis')
# Crown follows the brow, not horns; strong central V and two lateral peaks.
plate('Angular gold crown',[(-1.02,10.08,.87),(-.92,10.58,.75),(-.52,10.29,1.0),(0,10.08,1.13),(.52,10.29,1.0),(.92,10.58,.75),(1.02,10.08,.87),(.51,9.99,1.08),(0,9.87,1.18),(-.51,9.99,1.08)],.13,gold,'Head')
plate('Crown central crest',[(-.27,10.17,1.11),(0,10.68,.98),(.27,10.17,1.11),(0,9.98,1.24)],.08,edge,'Head')
# Tangible clumped fur: tapered ridged tufts with a consistent natural downward lay.
def tuft(name,p,direction,length,width,material,bone):
 p=v(p);d=v(direction).normalized();u=d.cross(Vector((0,-1,0)))
 if u.length<.1:u=d.cross(Vector((1,0,0)))
 u.normalize();w=d.cross(u);verts=[];faces=[]
 for k in range(5):
  t=k/4;center=p+d*length*t+w*length*.10*math.sin(t*math.pi);radius=width*([.65,1,.8,.4,.015][k])
  for q in range(4):verts.append(center+u*math.cos(q*math.tau/4)*radius+w*math.sin(q*math.tau/4)*radius*.23)
 for k in range(4):
  for q in range(4):faces.append((k*4+q,k*4+(q+1)%4,(k+1)*4+(q+1)%4,(k+1)*4+q))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);return finish(o,name,material,bone)
# Use true surface normals on the sculpt; sparse finite tuft budget, no hair simulation.
body.data.update();surface_faces=list(body.data.polygons);bpy.context.view_layer.update()
def region(p):
 x,y,z=p;side='Left' if x<0 else 'Right'
 if y>8.2:return 'Neck'
 if abs(x)>2.35:return side+('UpperArm' if y>5.75 else 'Forearm')
 if y<4.3 and abs(x)>.65:return side+('Thigh' if y>2.3 else 'Shin')
 return 'Chest' if y>6.4 else 'Spine' if y>4.7 else 'Pelvis'
for i in range(1250):
 f=random.choice(surface_faces);c=body.matrix_world@f.center;n=f.normal;canonical=(c.x,c.z,-c.y)
 # Avoid the bare chest/abdomen and armor surfaces; fur silhouettes carry detail.
 if canonical[2]>.65 and abs(canonical[0])<1.30 and 4.6<canonical[1]<7.7:continue
 if abs(canonical[0])>1.8 and canonical[1]>7.7:continue
 if abs(canonical[0])>3.2 and 4.0<canonical[1]<4.9:continue
 outward=(n.x,n.z,-n.y);d=(outward[0]*.38,-.85+outward[1]*.25,outward[2]*.32);tuft('Body fur clump',canonical,d,random.uniform(.14,.25),random.uniform(.023,.047),fur,region(canonical))
for i in range(320):
 a=random.random()*math.tau;yy=random.uniform(8.45,10.26);r=1.0 if yy>9.1 else .86;p=(math.cos(a)*r,yy,.15+math.sin(a)*.8)
 if p[2]>.65 and abs(p[0])<.65:continue
 tuft('Silver layered mane',p,(math.cos(a)*.34,-.7,math.sin(a)*.2),random.uniform(.27,.55),random.uniform(.07,.14),silver,'Head')
from mathutils.bvhtree import BVHTree
body_tree=BVHTree.FromPolygons([body.matrix_world@vert.co for vert in body.data.vertices],[list(face.vertices) for face in body.data.polygons])
def on_surface(p):
 hit,normal,_,_=body_tree.ray_cast(v((p[0],p[1],5)),v((0,0,-1)),10)
 return (p[0],p[1],-hit.y+.015) if hit else p
# Branching emissive fissures follow the exposed limb surface, with dark inset edges.
for s,label in [(-1,'Left'),(1,'Right')]:
 for top,bottom,xx,zz,bone in [(7.3,6.1,2.95,.97,label+'UpperArm'),(5.25,4.65,4.1,1.48,label+'Forearm'),(3.95,2.95,1.35,1.10,label+'Thigh'),(1.85,1.02,1.65,1.09,label+'Shin')]:
  pts=[(s*(xx+random.uniform(-.15,.15)),top+(bottom-top)*i/6,zz+random.uniform(-.025,.025)) for i in range(7)];pts=[on_surface(p) for p in pts];tube('Fissure dark channel',pts,.042,mouth,bone);tube('Red orange fissure',pts,.022,hot,bone)
  for k in [2,4]:
   p=pts[k];branch=[p,(p[0]+s*.32,p[1]+.1,p[2]-.01),(p[0]+s*.45,p[1]+.04,p[2]-.05)];tube('Branching energy crack',[on_surface(p) for p in branch],.017,hot,bone)
# Register measured anatomy. Bones use the same reusable naming contract as Titan.
rig_data=bpy.data.armatures.new('ArmoredApexSkeleton');rig=bpy.data.objects.new('ArmoredApexSkeleton',rig_data);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
segments={}
def bone(name,a,b,parent=None):
 q=rig_data.edit_bones.new(name);q.head=v(a);q.tail=v(b);segments[name]=(v(a),v(b))
 if parent:q.parent=rig_data.edit_bones[parent]
bone('Root',(0,0,0),(0,.6,0));bone('Pelvis',(0,4.15,0),(0,5,0),'Root');bone('Spine',(0,5,0),(0,6.45,0),'Pelvis');bone('Chest',(0,6.45,0),(0,8.0,0),'Spine');bone('Neck',(0,8,0),(0,8.8,.12),'Chest');bone('Head',(0,8.8,.12),(0,9.8,.24),'Neck');bone('Jaw',(0,8.72,1.0),(0,8.45,1.4),'Head');bone('Mouth',(0,9.0,1.55),(0,9,1.7),'Head')
for s,label in [(-1,'Left'),(1,'Right')]:
 bone(label+'Shoulder',(s*1.9,7.65,0),(s*2.65,7.45,.08),'Chest');bone(label+'UpperArm',(s*2.65,7.45,.08),(s*3.65,5.7,.42),label+'Shoulder');bone(label+'Forearm',(s*3.65,5.7,.42),(s*4.1,4.05,.95),label+'UpperArm');bone(label+'Hand',(s*4.1,4.05,.95),(s*4.1,3.45,1.5),label+'Forearm')
 bone(label+'Thigh',(s*.95,4.25,-.05),(s*1.42,2.25,.2),'Pelvis');bone(label+'Shin',(s*1.42,2.25,.2),(s*1.63,.65,.5),label+'Thigh');bone(label+'Foot',(s*1.63,.65,.5),(s*1.63,.30,1.5),label+'Shin')
bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
# Weight the continuous body by its own anatomical chain; never couple a hand to a leg.
def point_segment(p,a,b):
 d=b-a;t=max(0,min(1,(p-a).dot(d)/d.length_squared));return (p-a-t*d).length
for name in segments:body.vertex_groups.new(name=name)
for vertex in body.data.vertices:
 p=body.matrix_world@vertex.co;key=region((p.x,p.z,-p.y));side='Left' if p.x<0 else 'Right'
 chain=([side+'Shoulder',side+'UpperArm',side+'Forearm',side+'Hand'] if 'Arm' in key or 'Forearm' in key else [side+'Thigh',side+'Shin',side+'Foot'] if key.endswith(('Thigh','Shin')) else ['Pelvis','Spine','Chest','Neck'])
 scores=sorted([(1/max(.35,point_segment(p,*segments[n]))**4,n) for n in chain],reverse=True)[:3];total=sum(w for w,n in scores)
 for weight,name in scores:body.vertex_groups[name].add([vertex.index],weight/total,'REPLACE')
# Rigidly bound armor and surface details move with their actual anatomical attachment.
for o,name in bone_objects.items():o.vertex_groups.new(name=name).add(list(range(len(o.data.vertices))),1.,'REPLACE')
# Single skinned draw group per LOD with material batches; no runtime primitive construction.
visible=[o for o in bpy.context.scene.objects if o.type=='MESH'];body.select_set(False)
near=join(visible,'MonsterNear');bpy.context.view_layer.objects.active=near
triangles=sum(len(face.vertices)-2 for face in near.data.polygons)
opt=near.modifiers.new('Mobile hero budget','DECIMATE');opt.ratio=min(1,60000/triangles);bpy.ops.object.modifier_apply(modifier=opt.name)
near.parent=rig;mod=near.modifiers.new('Apex skin','ARMATURE');mod.object=rig
# Smart UVs are offline only; the model ships with packed, reusable surface maps.
bpy.context.view_layer.objects.active=near;near.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.0,island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT')
# Bake real self-occlusion once, offline, into the same UV atlas used by every LOD.
ao=bpy.data.images.new('apex-surface-ao',width=512,height=512,alpha=False);ao.colorspace_settings.name='Non-Color'
group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
for material in near.data.materials:
 if not material or not material.use_nodes:continue
 nodes=material.node_tree.nodes;tex=nodes.new('ShaderNodeTexImage');tex.image=ao;nodes.active=tex;g=nodes.new('ShaderNodeGroup');g.node_tree=group;material.node_tree.links.new(tex.outputs['Color'],g.inputs['Occlusion'])
bpy.ops.object.select_all(action='DESELECT');near.select_set(True);bpy.context.view_layer.objects.active=near;bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=16
bpy.ops.object.bake(type='AO',margin=4);pixels=np.array(ao.pixels[:],dtype=np.float32).reshape((-1,4));pixels[:,:3]=.35+.65*pixels[:,:3];ao.pixels.foreach_set(pixels.ravel());ao.filepath_raw=str(OUT/'apex-surface-ao.png');ao.file_format='PNG';ao.save();ao.pack()
lods=[near]
for name,ratio in [('MonsterMid',.52),('MonsterFar',.20)]:
 o=near.copy();o.data=near.data.copy();bpy.context.collection.objects.link(o);o.name=name;o.modifiers.clear();bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Apex surface LOD','DECIMATE');mod.ratio=ratio;bpy.ops.object.modifier_apply(modifier=mod.name);o.parent=rig;mod=o.modifiers.new('Apex skin','ARMATURE');mod.object=rig;lods.append(o)
# Authored reusable clips plus Titan procedural poses. Impact timing remains server owned.
rig.animation_data_create()
clips={'Idle':(2.4,{'Chest':(.01,0,0),'Spine':(-.007,0,0),'Jaw':(.03,0,0)}),'Walk':(2.4,{'LeftThigh':(.24,0,0),'RightThigh':(-.24,0,0),'LeftUpperArm':(-.12,0,0),'RightUpperArm':(.12,0,0)}),'Turn':(2.4,{'Chest':(0,0,.08)}),'AttackWindup':(.9,{'Chest':(-.08,0,0),'Jaw':(.2,0,0)}),'AttackRelease':(.6,{'Chest':(.12,0,0)}),'Recovery':(.8,{}),'Hit':(.5,{'Chest':(-.12,0,0)}),'Defeat':(3.0,{'Root':(math.pi/2,0,0)}),'TimeoutAttack':(2.0,{'Chest':(.25,0,0),'Jaw':(.35,0,0)})}
for name,(duration,motions) in clips.items():
 action=bpy.data.actions.new(name);action.use_fake_user=True;rig.animation_data.action=action
 for n,pb in rig.pose.bones.items():pb.rotation_mode='XYZ';pb.rotation_euler=(0,0,0);pb.location=(0,0,0)
 frames=[1,int(duration*24/2)+1,int(duration*24)+1]
 for k,frame in enumerate(frames):
  for n,pb in rig.pose.bones.items():
   factor=([0,1,0][k] if name not in ['Defeat','TimeoutAttack'] else k/2);pb.rotation_euler=tuple(v*factor for v in motions.get(n,(0,0,0)));pb.keyframe_insert('rotation_euler',frame=frame,group=n)
 rig.animation_data.action=None
for pb in rig.pose.bones:pb.rotation_euler=(0,0,0);pb.location=(0,0,0)
# Normalize by actual measured mesh height, keeping all rigid attachments and rig together.
height=max((near.matrix_world@vert.co).z for vert in near.data.vertices);root=bpy.data.objects.new('ArmoredApex',None);bpy.context.collection.objects.link(root);rig.parent=root;root.scale=(1/height,)*3
# Bake collapse/timeout ground contact into the authored root tracks.
for ending in ['Defeat','TimeoutAttack']:
 action=bpy.data.actions[ending];rig.animation_data.action=action
 if action.slots:rig.animation_data.action_slot=action.slots[0]
 samples=[];pb=rig.pose.bones['Root'];first,last=action.frame_range;frames=list(range(int(first),int(last)+1,3))
 if frames[-1]!=int(last):frames.append(int(last))
 for frame in frames:
  bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();evaluated=near.evaluated_get(bpy.context.evaluated_depsgraph_get());surface=evaluated.to_mesh();low=min((evaluated.matrix_world@p.co).z for p in surface.vertices);evaluated.to_mesh_clear()
  delta=(rig.matrix_world@rig.data.bones['Root'].matrix_local).to_3x3().inverted()@Vector((0,0,-low+.0007));samples.append((frame,pb.location.copy()+delta))
 for frame,location in samples:pb.location=location;pb.keyframe_insert(data_path='location',frame=frame,group='Ground contact')
rig.animation_data.action=None
for pb in rig.pose.bones:pb.rotation_euler=(0,0,0);pb.location=(0,0,0)
bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
for i,o in enumerate(lods):o.hide_render=i!=0;o.hide_set(i!=0)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'armored-apex.blend'))
for o in lods:o.hide_render=False;o.hide_set(False)
bpy.ops.object.select_all(action='DESELECT');root.select_set(True);rig.select_set(True)
for o in lods:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(ROOT/'client/public/assets/models/monsters/armored-apex.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_cameras=False,export_lights=False)
# Measured bind positions for the shared engine, including the actual gem weak point.
keys={'body':'Spine','neck':'Neck','head':'Head','mouth':'Mouth','shoulder-left':'LeftUpperArm','shoulder-right':'RightUpperArm','elbow-left':'LeftForearm','elbow-right':'RightForearm','hand-left':'LeftHand','hand-right':'RightHand','hip-left':'LeftThigh','hip-right':'RightThigh','knee-left':'LeftShin','knee-right':'RightShin','foot-left':'LeftFoot','foot-right':'RightFoot'}
anchors={key:[round(segments[name][0].x/height,7),round(segments[name][0].z/height,7),round(-segments[name][0].y/height,7)] for key,name in keys.items()};anchors['gem']=[0,7.12/height,1.90/height];keys['gem']='Chest'
metadata={'url':'/assets/models/monsters/armored-apex.glb','forwardYaw':0,'legacyYawOffset':0,'neckAimWeight':.35,'anchors':anchors,'bones':keys,'lods':['MonsterNear','MonsterMid','MonsterFar'],'clips':list(clips),'height':960,'sourceHeight':height}
(ROOT/'shared/armored-apex-model.mjs').write_text('// Authored and measured by scripts/build-armored-apex.py. +Z forward.\nexport const armoredApexModel = Object.freeze('+json.dumps(metadata,separators=(',',':'))+');\n')
(OUT/'model-measurements.json').write_text(json.dumps(metadata,indent=2)+'\n')
# Fit real near-mesh anatomical volumes; keep the exposed gem separate from the chest hull.
regions={}
for vertex in near.data.vertices:
 if not vertex.groups:continue
 g=max(vertex.groups,key=lambda g:g.weight);name=near.vertex_groups[g.group].name
 point=near.matrix_world@vertex.co
 # Matrix includes the normalization root now; convert back to source before region fitting.
 point*=height
 if abs(point.x)<.60 and 6.45<point.z<7.85 and -point.y>1.62:continue
 if name not in segments:continue
 a,b=segments[name];direction=b-a;t=max(0,min(1,(point-a).dot(direction)/direction.length_squared));bucket=0 if t<.5 else 1
 if name not in ['Chest','Spine','LeftForearm','RightForearm']:bucket=0
 regions.setdefault((name,bucket),[]).append(point/height)
volumes=[]
for (name,bucket),points in sorted(regions.items()):
 if len(points)<5:continue
 c=Vector(tuple((min(p[i] for p in points)+max(p[i] for p in points))/2 for i in range(3)));r=[max(.006,max(abs(p[i]-c[i]) for p in points))*1.02 for i in range(3)];ds=sorted((p-c).length for p in points)
 volumes.append({'part':name+str(bucket),'x':-c.x,'y':c.z,'z':c.y,'radius':ds[int((len(ds)-1)*.98)],'radii':{'x':r[0],'y':r[2],'z':r[1]}})
geometry={'sourceHeight':height,'bounds':{'min':[-.55,0,-.3],'max':[.55,1,.3]},'mouth':{'x':-anchors['mouth'][0],'y':anchors['mouth'][1],'z':-anchors['mouth'][2]},'headPivot':{'x':0,'y':anchors['head'][1],'z':-anchors['head'][2]},'neckPivot':{'x':0,'y':anchors['neck'][1],'z':-anchors['neck'][2]},'footHeight':anchors['foot-left'][1],'footX':abs(anchors['foot-left'][0]),'footZ':-anchors['foot-left'][2],'spheres':volumes}
(ROOT/'shared/armored-apex-geometry.mjs').write_text('// Measured from the actual Armored Apex near mesh.\nexport const armoredApexGeometry = Object.freeze('+json.dumps(geometry,separators=(',',':'))+');\n')

# Studio contact sheet from the true exported scene, never the reference PNG.
for i,o in enumerate(lods):o.hide_render=i!=0
world=bpy.data.worlds.new('Apex studio');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.06,.08,.12,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35
bpy.ops.object.camera_add(location=(1.5,-2.7,1.35));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,.48))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=1.45;bpy.context.scene.camera=camera
for loc,power,size in [((1,-2,3),70,3),((-2,-1,1.7),45,2),((1,2,2),85,2)]:
 bpy.ops.object.light_add(type='AREA',location=loc);lamp=bpy.context.object;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size;lamp.rotation_euler=(Vector((0,0,.5))-lamp.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.film_transparent=False;scene.render.image_settings.file_format='PNG';scene.render.filepath='/tmp/armored-apex-authoring.png';bpy.ops.render.render(write_still=True)
print('APEX_BUILT',json.dumps({'height':height,'vertices':len(near.data.vertices),'triangles':sum(len(p.vertices)-2 for p in near.data.polygons)}))
