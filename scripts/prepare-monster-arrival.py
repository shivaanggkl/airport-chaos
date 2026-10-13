"""Mission 19 asset repair. Run: blender -b --python scripts/prepare-monster-arrival.py.
The supplied GLB remains immutable. Rebuild all LODs and the rig from its surface.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/monster-arrival'
RUNTIME = ROOT / 'client/public/assets/models/monsters/monster-arrival.glb'
# Reuse the authored actions, not the independently decimated/skinned old surfaces.
with bpy.data.libraries.load(str(OUT / 'monster-arrival-editable.blend'), link=False) as (src, dst):
    dst.actions = [n for n in src.actions if n in ('Idle','Walk','Turn','AttackWindup','AttackRelease','Recovery','Hit','Defeat','TimeoutAttack')]
actions = {a.name.split('.')[0]: a for a in dst.actions}
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(OUT / 'supplied-source.glb'))
o = next(o for o in bpy.context.scene.objects if o.type == 'MESH'); o.name = 'RepairedSource'
bm = bmesh.new(); bm.from_mesh(o.data)
bm.verts.ensure_lookup_table()
# The only source boundaries are two microscopic sole holes. Close those at
# their actual boundary, preserving the mouth's sculpted interior.
boundary = [e for e in bm.edges if e.is_boundary]
assert all(v.co.z < -.49 for e in boundary for v in e.verts), 'Unexpected source boundary: inspect before repairing'
bmesh.ops.holes_fill(bm, edges=boundary, sides=12)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(o.data); bm.free()
def smooth(a,b,x):
    t=max(0.,min(1.,(x-a)/(b-a))); return t*t*(3-2*t)
# The source neck is watertight, but has a deep folded anterior throat pocket.
# Resculpt the existing anterior vertices into a continuous throat/chest contour;
# no overlay, cap mesh, material sidedness or visibility trick is used.
repaired = 0
for v in o.data.vertices:
    x,y,z=v.co
    if y >= -.04 or not (.155 < z < .325) or abs(x) >= .19: continue
    w=smooth(.155,.20,z)*(1-smooth(.295,.325,z))*(1-smooth(.10,.19,abs(x)))
    contour=-.275 - (z-.20)*.55 + (abs(x)/.19)**2*.025
    if y > contour:
        v.co.y += (contour-y)*w; repaired += 1
# Relax the resculpted pocket's folded edges on the original connected surface.
# The lips and jaw lie above .325 and are deliberately excluded.
bm=bmesh.new();bm.from_mesh(o.data)
for _ in range(18):
    moves=[]
    for v in bm.verts:
        x,y,z=v.co
        if not (.155<z<.325 and y<-.08 and abs(x)<.19):continue
        w=smooth(.155,.20,z)*(1-smooth(.295,.325,z))*(1-smooth(.10,.19,abs(x)))
        ns=[e.other_vert(v).co for e in v.link_edges]
        if ns:moves.append((v,v.co.lerp(sum(ns,Vector())/len(ns),.55*w)))
    for v,p in moves:v.co=p
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
# Ground-origin, unit-height mesh. Uniform normalization preserves proportions.
lo=min(v.co.z for v in o.data.vertices); hi=max(v.co.z for v in o.data.vertices); h=hi-lo
for v in o.data.vertices: v.co=(v.co.x/h,v.co.y/h,(v.co.z-lo)/h)
o.data.update()
# A single vertex-colour material keeps the faceted supplied surface and avoids
# one draw per painted region. Linear colours export as glTF COLOR_0.
mat=bpy.data.materials.new('Monster skin');mat.use_nodes=True;mat.use_backface_culling=True
bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.88
color=mat.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='Color';mat.node_tree.links.new(color.outputs['Color'],bs.inputs['Base Color'])
o.data.materials.clear();o.data.materials.append(mat)
colors=[(.32,.073,.036,1),(.085,.014,.018,1),(.52,.35,.19,1),(.76,.65,.43,1),(.72,.26,.014,1),(.013,.005,.003,1)]
attr=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
for f in o.data.polygons:
    p=sum((o.data.vertices[i].co for i in f.vertices),Vector())/len(f.vertices); x,y,z=p; sz=z*h+lo
    index=0
    if sz>.415 and abs(x)>.075 and y>-.21: index=3
    elif sz<-.45 and y<-.20: index=3
    elif -.35<sz<-.245 and abs(x)>.36 and y<-.12: index=3
    elif y<-.08 and abs(x)<(.065 if sz<-.075 else .175 if sz<.17 else .145) and -.16<sz<.325: index=2
    elif y<-.28 and .27<sz<.345 and abs(x)<.15: index=2
    elif y>.08 and sz>-.28: index=1
    for i in f.loop_indices:
        p=o.data.vertices[o.data.loops[i].vertex_index].co;vx,vy,vz=p;svz=vz*h+lo
        belly=(1-smooth(.125,.17,abs(vx)))*(1-smooth(-.12,-.065,vy))*smooth(-.16,-.11,svz)*(1-smooth(.315,.34,svz))
        base=colors[index]
        if -.16<svz<.34 and abs(vx)<.18 and index in (0,2):
            base=tuple(colors[0][j]*(1-belly)+colors[2][j]*belly for j in range(4))
        attr.data[i].color=base
# Keep the editable repaired source; optimize before skinning, once.
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
near=o.copy();near.data=o.data.copy();bpy.context.collection.objects.link(near);near.name='MonsterNear'
bpy.context.view_layer.objects.active=near;near.select_set(True);o.select_set(False)
mod=near.modifiers.new('Surface LOD','DECIMATE');mod.ratio=32000/len(near.data.polygons);bpy.ops.object.modifier_apply(modifier=mod.name)
# Preserve restrained facets while avoiding harsh micro-triangle normal noise.
for f in near.data.polygons:f.use_smooth=True
# Repair after decimation as well; enforce a closed body in every exported LOD.
def close_and_norm(mesh):
    bm=bmesh.new();bm.from_mesh(mesh);edges=[e for e in bm.edges if e.is_boundary]
    if edges:bmesh.ops.holes_fill(bm,edges=edges,sides=24)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
close_and_norm(near.data)
a=bpy.data.armatures.new('MonsterArrivalSkeleton');rig=bpy.data.objects.new('MonsterArrivalSkeleton',a);bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
def point(p):return Vector((p[0]/h,p[1]/h,(p[2]-lo)/h))
def bone(n,head,tail,parent=None):
    b=a.edit_bones.new(n);b.head=point(head);b.tail=point(tail)
    if parent:b.parent=a.edit_bones[parent]
bone('Root',(0,0,-.20),(0,0,-.13));bone('Pelvis',(0,0,-.13),(0,0,-.01),'Root')
bone('Spine',(0,0,-.01),(0,0,.16),'Pelvis');bone('Chest',(0,0,.16),(0,-.025,.27),'Spine')
bone('Neck',(0,-.025,.27),(0,-.10,.37),'Chest');bone('Head',(0,-.10,.37),(0,-.26,.39),'Neck')
bone('Jaw',(0,-.24,.335),(0,-.40,.32),'Head');bone('Mouth',(0,-.49,.33),(0,-.515,.33),'Head')
for s,label in ((-1,'Left'),(1,'Right')):
    bone(label+'Shoulder',(s*.22,-.01,.19),(s*.31,-.015,.12),'Chest')
    bone(label+'UpperArm',(s*.31,-.015,.12),(s*.38,-.015,-.03),label+'Shoulder')
    bone(label+'Forearm',(s*.38,-.015,-.03),(s*.42,-.12,-.20),label+'UpperArm')
    bone(label+'Hand',(s*.42,-.12,-.20),(s*.42,-.20,-.27),label+'Forearm')
    bone(label+'Thigh',(s*.16,.03,-.13),(s*.23,-.01,-.30),'Pelvis')
    bone(label+'Shin',(s*.23,-.01,-.30),(s*.23,-.12,-.43),label+'Thigh')
    bone(label+'Foot',(s*.23,-.12,-.43),(s*.23,-.25,-.47),label+'Shin')
bone('TailBase',(0,.11,-.18),(0,.27,-.25),'Pelvis');bone('TailMid',(0,.27,-.25),(.07,.39,-.24),'TailBase');bone('TailTip',(.07,.39,-.24),(.23,.48,-.13),'TailMid')
bpy.ops.object.mode_set(mode='OBJECT')
segments={b.name:(b.head_local.copy(),b.tail_local.copy()) for b in a.bones if b.name!='Mouth'}
chains={'core':['Pelvis','Spine','Chest','Neck','Head'],'tail':['TailBase','TailMid','TailTip']}
for side in ('Left','Right'):
    chains[side+'Arm']=['Chest',side+'Shoulder',side+'UpperArm',side+'Forearm',side+'Hand']
    chains[side+'Leg']=['Pelvis',side+'Thigh',side+'Shin',side+'Foot']
def distance(p,u,v):
    d=v-u;t=max(0,min(1,(p-u).dot(d)/max(d.length_squared,1e-8)));return (p-u-t*d).length
def cw(p,names):
    distances=sorted((distance(p,*segments[n]),n) for n in names)[:3]
    raw=[1/max(d,.04)**3 for d,n in distances];total=sum(raw);return {n:w/total for (d,n),w in zip(distances,raw)}
weights=[]
for v in near.data.vertices:
    x,y,z=v.co;sz=z*h+lo;side='Left' if x<0 else 'Right'
    tail=smooth(.14,.27,y)*(1-smooth(.18,.31,sz))
    arm=(1-tail)*smooth(.20,.34,abs(x))*smooth(-.32,-.20,sz)
    leg=(1-tail)*(1-arm)*smooth(.09,.21,abs(x))*(1-smooth(-.21,-.09,sz))
    w={}
    for factor,key in [(max(0,1-tail-arm-leg),'core'),(tail,'tail'),(arm,side+'Arm'),(leg,side+'Leg')]:
        if factor>.001:
            for n,value in cw(v.co,chains[key]).items():w[n]=w.get(n,0)+value*factor
    # Head/eyes/horns move rigidly; the jaw influences only the lower snout,
    # never the throat or shoulder surface.
    if sz>.35 and y<.06:w={'Head':1.}
    jaw=smooth(-.30,-.40,y)*(1-smooth(.325,.345,sz))*smooth(.285,.30,sz)*(1-smooth(.14,.20,abs(x)))
    if jaw>0:
        w={n:value*(1-jaw) for n,value in w.items()};w['Jaw']=jaw
    # Sole and toe vertices belong rigidly to the foot; a smooth ankle blend
    # stops shin/pelvis weights lifting the sole during planted turns.
    if sz<-.36 and abs(x)>.10 and tail<.2:
        foot=1-smooth(-.425,-.36,sz)
        w={n:value*(1-foot) for n,value in w.items()};w[side+'Foot']=w.get(side+'Foot',0)+foot
    weights.append(w)
# Laplacian weights across connected surface neighbourhoods keep shoulder
# transition continuous; no vertex may retain distant auto-heat bone influence.
neighbors=[set() for _ in near.data.vertices]
for e in near.data.edges:
    u,v=e.vertices;neighbors[u].add(v);neighbors[v].add(u)
for iteration in range(5):
    new=[]
    for i,w in enumerate(weights):
        if len(w)==1 and ('Head' in w or any(n.endswith('Foot') for n in w)):new.append(w);continue
        merged={n:.6*t for n,t in w.items()};ns=neighbors[i]
        for j in ns:
            for n,t in weights[j].items():merged[n]=merged.get(n,0)+.4*t/max(1,len(ns))
        top=sorted(merged.items(),key=lambda item:-item[1])[:4];total=sum(t for n,t in top);new.append({n:t/total for n,t in top})
    weights=new
for n in segments:near.vertex_groups.new(name=n)
for i,w in enumerate(weights):
    for n,t in w.items():near.vertex_groups[n].add([i],t,'REPLACE')
near.parent=rig;mod=near.modifiers.new('Creature skin','ARMATURE');mod.object=rig
lods=[near]
for name,count in [('MonsterMid',14000),('MonsterFar',5000)]:
    mesh=near.copy();mesh.data=near.data.copy();bpy.context.collection.objects.link(mesh);mesh.name=name
    mesh.modifiers.clear();bpy.context.view_layer.objects.active=mesh;bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True)
    mod=mesh.modifiers.new('Surface LOD','DECIMATE');mod.ratio=count/len(mesh.data.polygons);bpy.ops.object.modifier_apply(modifier=mod.name);close_and_norm(mesh.data)
    mod=mesh.modifiers.new('Creature skin','ARMATURE');mod.object=rig;lods.append(mesh)
# Place the eyes in the supplied mesh's LATERAL recess beneath each brow.
# Front-facing rays hit the upper snout and made the eyes look like stickers.
# Keep these small facial surfaces after decimation and rigidly bound to Head.
from mathutils.bvhtree import BVHTree
face_tree=BVHTree.FromPolygons([v.co.copy() for v in near.data.vertices], [list(f.vertices) for f in near.data.polygons])
for surface in lods:
    for side in (-1,1):
        y,z=-.313/h,(.450-lo)/h
        hit,normal,_,_=face_tree.ray_cast(Vector((side,y,z)),Vector((-side,0,0)))
        assert hit is not None, 'Missing lateral eye socket surface'
        # Look slightly forward from the side socket; keep the pupil vertical.
        # A stable anatomical axis avoids following the downward-facing brow.
        outward=Vector((side*.94,-.34,0)).normalized()
        orientation=Vector((0,-1,0)).rotation_difference(outward)
        center=hit-outward*.003/h
        for offset,scale,tint in [((0,0,0),(.012/h,.0045/h,.0085/h),(.95,.43,.025,1)),
             ((0,-.0041/h,0),(.0025/h,.0008/h,.0065/h),colors[5]),
             ((-side*.003/h,-.0045/h,.002/h),(.0012/h,.0004/h,.0012/h),(.95,.88,.65,1))]:
            loc=center+orientation@Vector(offset)
            bpy.ops.object.select_all(action='DESELECT')
            bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=8,location=loc)
            eye=bpy.context.object;eye.rotation_mode='QUATERNION';eye.rotation_quaternion=orientation;eye.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
            eye.data.materials.append(mat);a=eye.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
            for color in a.data:color.color=tint
            for face in eye.data.polygons:face.use_smooth=True
            eye.vertex_groups.new(name='Head').add(list(range(len(eye.data.vertices))),1.,'REPLACE')
            bpy.ops.object.select_all(action='DESELECT');surface.select_set(True);eye.select_set(True)
            bpy.context.view_layer.objects.active=surface;bpy.ops.object.join()
# Existing authored clips are reused, with a heavy 4.8 s walking cycle and
# restrained shoulder motion. Foot contact correction runs on these rig chains.
rig.animation_data_create()
for name,action in actions.items():
    action.name=name;action.use_fake_user=True
    slot=action.slots[0] if action.slots else None
    if slot:
        for layer in action.layers:
            for strip in layer.strips:
                for channelbag in strip.channelbags:
                    for fc in channelbag.fcurves:
                        if name in ('Walk','Turn'):
                            for k in fc.keyframe_points:
                                k.co.x=(k.co.x-1)*(2 if name=='Walk' else 2)+1
                                k.handle_left.x=(k.handle_left.x-1)*2+1;k.handle_right.x=(k.handle_right.x-1)*2+1
                        if 'Shoulder' in fc.data_path or 'UpperArm' in fc.data_path:
                            for k in fc.keyframe_points:k.co.y*=.55;k.handle_left.y*=.55;k.handle_right.y*=.55
                        if name=='AttackWindup':
                            for k in fc.keyframe_points:k.co.x=(k.co.x-1)*45/33+1;k.handle_left.x=(k.handle_left.x-1)*45/33+1;k.handle_right.x=(k.handle_right.x-1)*45/33+1
    rig.animation_data.action=action
rig.animation_data.action=None
for b in rig.pose.bones:b.rotation_mode='XYZ';b.rotation_euler=(0,0,0)
# Bake ground contact into ending clips, in the root bone's actual local axes.
# The donor rig's origin differs from the repaired ground-origin mesh. This is
# authored motion data, with no runtime vertex scans or additional geometry.
def ground_ending_clips(rig, surface, actions):
    original=rig.animation_data.action
    for name in ('Defeat','TimeoutAttack'):
        action=actions[name];rig.animation_data.action=action
        if action.slots:rig.animation_data.action_slot=action.slots[0]
        first,last=action.frame_range;frames=list(range(int(first),int(last)+1,3))
        if frames[-1]!=int(last):frames.append(int(last))
        samples=[];root=rig.pose.bones['Root']
        for frame in frames:
            bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
            evaluated=surface.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
            low=min((evaluated.matrix_world@v.co).z for v in mesh.vertices);evaluated.to_mesh_clear()
            correction=rig.data.bones['Root'].matrix_local.to_3x3().inverted()@Vector((0,0,-low+.0007))
            samples.append((frame,root.location.copy()+correction))
        for frame,location in samples:
            root.location=location;root.keyframe_insert(data_path='location',frame=frame,group='Ground contact')
    rig.animation_data.action=original
    for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0)
    bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
ground_ending_clips(rig,near,actions)
# Collision volumes are fitted from the final near surface's dominant anatomical
# weights, subdividing long bones. The glTF +Z-to-server -Z rotation also
# flips X; convert both axes so asymmetric tail and limb volumes match the mesh.
regions={}
for v in near.data.vertices:
    if not v.groups:continue
    g=max(v.groups,key=lambda g:g.weight);name=near.vertex_groups[g.group].name
    if name not in segments:continue
    u,w=segments[name];d=w-u;t=max(0,min(1,(v.co-u).dot(d)/max(d.length_squared,1e-8)))
    bucket=(name,0 if t<.5 else 1) if name in ('Head','Spine','Chest','TailBase','TailMid','TailTip','LeftForearm','RightForearm') else (name,0)
    regions.setdefault(bucket,[]).append(v.co.copy())
spheres=[]
for key,vs in sorted(regions.items()):
    if len(vs)<8:continue
    center=Vector(tuple((min(p[i] for p in vs)+max(p[i] for p in vs))/2 for i in range(3)))
    ds=sorted((p-center).length for p in vs);radius=ds[int((len(ds)-1)*.99)]
    radii=[max(.006,max(abs(p[i]-center[i]) for p in vs))*1.06 for i in range(3)]
    spheres.append({'part':key[0]+str(key[1]),'x':round(-center.x,6),'y':round(center.z,6),'z':round(center.y,6),'radius':round(radius,6),
        'radii':{'x':round(radii[0],6),'y':round(radii[2],6),'z':round(radii[1],6)}})
bounds={'min':[min(v.co[i] for v in near.data.vertices) for i in range(3)],'max':[max(v.co[i] for v in near.data.vertices) for i in range(3)]}
metadata={'sourceHeight':h,'repairedThroatVertices':repaired,'bounds':{'min':[-bounds['max'][0],bounds['min'][2],bounds['min'][1]],'max':[-bounds['min'][0],bounds['max'][2],bounds['max'][1]]},'mouth':{'x':0,'y':(.33-lo)/h,'z':-.49/h},'headPivot':{'x':0,'y':(.37-lo)/h,'z':-.10/h},'neckPivot':{'x':0,'y':(.27-lo)/h,'z':-.025/h},'footHeight':(-.43-lo)/h,'footX':.23/h,'footZ':-.12/h,'spheres':spheres}
(OUT/'monster-arrival-geometry.json').write_text(json.dumps(metadata,indent=2)+'\n')
shared='// Generated by scripts/prepare-monster-arrival.py from the repaired bind mesh.\nexport const monsterGeometry = Object.freeze('+json.dumps(metadata,separators=(',',':'))+');\n'
(ROOT/'shared/monster-arrival-geometry.mjs').write_text(shared)
(ROOT/'shared/monster-arrival-geometry.d.mts').write_text('export const monsterGeometry: Readonly<{ sourceHeight: number; repairedThroatVertices: number; bounds: { min: number[]; max: number[] }; mouth: {x:number;y:number;z:number}; headPivot: {x:number;y:number;z:number}; neckPivot: {x:number;y:number;z:number}; footHeight: number; footX: number; footZ: number; spheres: readonly { part: string; x: number; y: number; z: number; radius: number; radii: {x:number;y:number;z:number} }[] }>;\n')
o.hide_render=True;o.hide_set(True)
for i,obj in enumerate(lods):obj.hide_render=i!=0;obj.hide_set(i!=0)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'monster-arrival-repaired.blend'))
for obj in lods:obj.hide_render=False;obj.hide_set(False)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for obj in lods:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(RUNTIME),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_merge_animation='NONE',export_cameras=False,export_lights=False)
print('REPAIR_RESULT',json.dumps({'sourceHeight':h,'throatVertices':repaired,'bounds':metadata['bounds'],'triangles':{m.name:sum(len(f.vertices)-2 for f in m.data.polygons) for m in lods},'spheres':len(spheres)}))
