"""Blender -b --python scripts/prepare-ashen-emissive.py -- supplied.glb
Keep the original texture; derive a small red-only emission mask, not a replacement paint job.
"""
import bpy,numpy as np,sys,struct,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=sys.argv[sys.argv.index('--')+1] if '--'in sys.argv else '/Users/shiva/Downloads/ashen-warlord-m19.glb'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=source)
im=next(i for i in bpy.data.images if i.size[0]>256)
if im.size[0]>1024:im.scale(1024,1024)
w,h=im.size;p=np.array(im.pixels[:],dtype=np.float32).reshape(h,w,4);r,g,b=p[:,:,0],p[:,:,1],p[:,:,2];mask=np.clip((r-np.maximum(g,b)*1.5)*4,0,1);out=np.zeros_like(p);out[:,:,:3]=p[:,:,:3]*mask[:,:,None];out[:,:,3]=1
m=bpy.data.images.new('Ashen red emissive mask',width=w,height=h,alpha=True);m.pixels.foreach_set(out.ravel());m.filepath_raw=str(root/'assets/ashen-warlord/emissive.png');m.file_format='PNG';m.save()

# Read original glTF attributes so landmark indices remain identical to the runtime mesh.
f=open(source,'rb');f.read(12);length,_=struct.unpack('<II',f.read(8));doc=json.loads(f.read(length));f.read(8);binary=f.read()
def data(index,width):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];return np.frombuffer(binary,dtype='<f4',count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,width)
attrs=doc['meshes'][0]['primitives'][0]['attributes'];positions=data(attrs['POSITION'],3);uvs=data(attrs['TEXCOORD_0'],2);indices=[]
for i,(pos,uv)in enumerate(zip(positions,uvs)):
 if abs(pos[0])<.055 and .70<pos[1]<.85 and abs(pos[2])>.075:
  x=max(0,min(w-1,int(uv[0]*w)));y=max(0,min(h-1,int((1-uv[1])*h)));color=p[y,x,:3]
  if color[0]>max(color[1],color[2])*1.5 and color[0]>.1:indices.append(i)
if len(indices)<8:raise RuntimeError('Could not identify actual textured chest crystal')
(root/'assets/ashen-warlord/landmarks.json').write_text(json.dumps({'coreIndices':indices})+'\n');print('CORE_LANDMARKS',len(indices),positions[indices].mean(axis=0),flush=True)
