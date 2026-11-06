import * as THREE from 'three';
import {CinematicImpactBlast,cinematicImpactTexture} from './cinematic-impact';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';

// Begin dissolution just after the initial flash peaks, without waiting for the defeat clip.
export const MONSTER_VICTORY=Object.freeze({blastSeconds:.6,dissolveSeconds:5,holdSeconds:1.5});
export const MONSTER_VICTORY_SECONDS=MONSTER_VICTORY.blastSeconds+MONSTER_VICTORY.dissolveSeconds+MONSTER_VICTORY.holdSeconds;
/** Victory-only presentation. One shared blast and a bounded surface-sampled ash buffer. */
export class MonsterVictory {
  readonly blast=new CinematicImpactBlast(model.height*3/900,undefined,false);
  readonly progress={value:0};
  private readonly smokeTexture=cinematicImpactTexture(false);
  private readonly smokeMaterial=new THREE.MeshBasicMaterial({map:this.smokeTexture,color:0x796b62,transparent:true,opacity:0,depthWrite:false,fog:false,toneMapped:false});
  readonly smoke=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),this.smokeMaterial,180);
  private readonly smokeMatrix=new THREE.Matrix4();
  private readonly geometry=new THREE.BufferGeometry();
  private readonly material=new THREE.PointsMaterial({size:10,sizeAttenuation:true,vertexColors:true,transparent:true,depthWrite:false,fog:false});
  readonly ash=new THREE.Points(this.geometry,this.material);
  private readonly count=900;
  private readonly origins=new Float32Array(this.count*3);
  private readonly positions=new Float32Array(this.count*3);
  private readonly release=new Float32Array(this.count);
  private readonly point=new THREE.Vector3();
  private readonly contact=new THREE.Vector3();
  private sampled=false;
  private disposed=false;
  constructor(private readonly scene:THREE.Scene){
    const colors=new Float32Array(this.count*3),color=new THREE.Color();
    for(let i=0;i<this.count;i++){color.setHex(i%7===0?0xd7ba8f:i%3===0?0x9b7160:0x6c4c4a);color.toArray(colors,i*3);}
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    this.blast.root.name='m19-victory-blast';
    this.ash.name='m19-victory-rising-ash';this.ash.visible=false;this.ash.frustumCulled=false;
    // Ten times the shared blast's 18 billows, batched into one camera-facing draw.
    this.smokeMaterial.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
        vec4 smokeCenter=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);
        smokeCenter.xy+=position.xy*length(instanceMatrix[0].xyz);
        gl_Position=projectionMatrix*smokeCenter;`);
    };
    this.smokeMaterial.customProgramCacheKey=()=> 'm19-victory-smoke';
    this.smoke.name='m19-victory-smoke';this.smoke.frustumCulled=false;
    this.smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.blast.root,this.ash,this.smoke);
  }
  attach(material:THREE.MeshStandardMaterial):void{
    material.onBeforeCompile=shader=>{
      shader.uniforms.monsterDissolve=this.progress;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vMonsterSurface;').replace('#include <project_vertex>','#include <project_vertex>\nvMonsterSurface=transformed;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float monsterDissolve; varying vec3 vMonsterSurface;').replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
        float grain=fract(sin(dot(floor(vMonsterSurface*140.0),vec3(12.9898,78.233,37.719)))*43758.5453);
        if(monsterDissolve>0.0 && (grain<monsterDissolve || monsterDissolve>=1.0))discard;`);
    };
    material.customProgramCacheKey=()=> 'm19-victory-granular-dissolve';material.needsUpdate=true;
  }
  update(age:number,mesh:THREE.SkinnedMesh,root:THREE.Object3D):void{
    if(this.disposed)return;
    this.contact.copy(root.position);this.contact.y+=model.height*.45;
    this.blast.update(age,this.contact);
    const smokeAge=Math.max(0,age-MONSTER_VICTORY.blastSeconds);
    this.smoke.visible=age<MONSTER_VICTORY_SECONDS;
    this.smokeMaterial.opacity=Math.min(.19,age*.4);
    for(let i=0;i<this.smoke.count;i++){
      const angle=i*2.399963,phase=(i*.618034)%1;
      const rise=(phase+smokeAge*.14)%1;
      const radius=model.height*(.12+.45*((i*.414214)%1))*(1+rise*.5);
      const size=model.height*(.18+.2*phase)*(1+rise*.6);
      this.smokeMatrix.makeScale(size,size,size);
      this.smokeMatrix.setPosition(root.position.x+Math.cos(angle)*radius,root.position.y+model.height*(.15+rise*1.65),root.position.z+Math.sin(angle)*radius);
      this.smoke.setMatrixAt(i,this.smokeMatrix);
    }
    this.smoke.instanceMatrix.needsUpdate=true;
    const t=age-MONSTER_VICTORY.blastSeconds;
    this.progress.value=THREE.MathUtils.clamp(t/MONSTER_VICTORY.dissolveSeconds,0,1);
    if(t<0)return;
    if(!this.sampled){
      const vertices=mesh.geometry.getAttribute('position').count;
      for(let i=0;i<this.count;i++){
        mesh.getVertexPosition(Math.floor(i*vertices/this.count),this.point);
        const x=Math.floor(this.point.x*140),y=Math.floor(this.point.y*140),z=Math.floor(this.point.z*140);
        const seed=Math.sin(x*12.9898+y*78.233+z*37.719)*43758.5453;
        this.release[i]=(seed-Math.floor(seed))*MONSTER_VICTORY.dissolveSeconds;
        mesh.localToWorld(this.point);this.point.toArray(this.origins,i*3);
      }
      this.sampled=true;
    }
    this.ash.visible=t<MONSTER_VICTORY.dissolveSeconds+MONSTER_VICTORY.holdSeconds;
    for(let i=0;i<this.count;i++){
      const flight=Math.max(0,t-this.release[i]!),j=i*3;
      this.positions[j]=this.origins[j]!+Math.sin(i*2.4)*flight*55;
      this.positions[j+1]=this.origins[j+1]!+flight*130+flight*flight*35;
      this.positions[j+2]=this.origins[j+2]!+Math.cos(i*1.7)*flight*55;
    }
    this.geometry.getAttribute('position').needsUpdate=true;
    this.material.opacity=Math.min(1,t*3)*THREE.MathUtils.clamp((MONSTER_VICTORY.dissolveSeconds+MONSTER_VICTORY.holdSeconds-t)/1.5,0,1);
  }
  dispose():void{if(this.disposed)return;this.disposed=true;this.blast.dispose();this.smoke.removeFromParent();this.smoke.geometry.dispose();this.smokeMaterial.dispose();this.smokeTexture.dispose();this.ash.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
