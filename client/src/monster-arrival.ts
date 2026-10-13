import * as THREE from 'three';
import { journeyDallas19 } from '../../shared/journey-mission.mjs';
import { setDowntownMonsterDamage } from './dallas-skyline';
import { monsterDamageSites } from './osm-city';
import { MonsterArrivalModel } from './monster-arrival-model';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type MonsterStateMessage = {
  type: 'monsterState'; attemptId: string; x: number; y: number; z: number; yaw: number;
  phase: 'walk' | 'windup'; hitSequence: number; jumpProgress?: number | null;
  velocity?: {x:number;y:number;z:number}; yawVelocity?: number; gaitPhase?: number;
  aimYaw?: number; aimPitch?: number; attackKind?: 'single' | 'fan';
  hitPosition?: { x: number; y: number; z: number };
  shots: { id: number; x: number; y: number; z: number; dx?:number; dy?:number; dz?:number; speed?:number; bornAt?:number }[];
  serverNow: number;
};

const coreGeometry = new THREE.IcosahedronGeometry(1,1);
const flameGeometry = new THREE.LatheGeometry([
  new THREE.Vector2(0,-120),new THREE.Vector2(4,-105),new THREE.Vector2(12,-60),
  new THREE.Vector2(30,-8),new THREE.Vector2(22,16),new THREE.Vector2(0,28),
],8).rotateX(Math.PI/2);
const coreMaterial = new THREE.MeshBasicMaterial({color:0xffdf69,toneMapped:false});
const forward = new THREE.Vector3(0,0,1);

type Particle = { x:number;y:number;z:number;vx:number;vy:number;vz:number;life:number;total:number;radius:number;dust:boolean };
/** One bounded draw for footfall dust, impact sparks and restrained smoke. */
class MonsterParticles {
  readonly points: THREE.Points;
  private readonly particles: Particle[];
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  constructor(capacity=96) {
    this.particles=Array.from({length:capacity},()=>({x:0,y:0,z:0,vx:0,vy:0,vz:0,life:0,total:1,radius:0,dust:true}));
    this.positions=new Float32Array(capacity*3);this.colors=new Float32Array(capacity*4);this.sizes=new Float32Array(capacity);
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('tint',new THREE.BufferAttribute(this.colors,4).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('size',new THREE.BufferAttribute(this.sizes,1).setUsage(THREE.DynamicDrawUsage));
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{pixelScale:{value:360}},
      vertexShader:`attribute vec4 tint; attribute float size; varying vec4 vTint;
        uniform float pixelScale; void main(){vTint=tint;vec4 p=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*pixelScale/max(1.,-p.z),0.,180.);}`,
      fragmentShader:`varying vec4 vTint;void main(){float r=length(gl_PointCoord-.5)*2.;
        float a=(1.-smoothstep(.2,1.,r))*vTint.a;if(a<.005)discard;gl_FragColor=vec4(vTint.rgb,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
    this.points=new THREE.Points(this.geometry,this.material);this.points.name='monster-pooled-dust-and-smoke';
    this.points.frustumCulled=false; // Bounds move across a finite 96-slot pool.
  }
  emit(x:number,y:number,z:number,dust:boolean,count:number,radius:number,spreadFactor=.45): void {
    let made=0;
    for (let i=0;i<this.particles.length && made<count;i++) {
      const p=this.particles[i]!;if(p.life>0)continue;
      const angle=made*2.399,spread=dust?radius*spreadFactor:3;
      p.x=x+Math.sin(angle)*spread;p.y=y+(dust?5:0);p.z=z+Math.cos(angle)*spread;
      p.vx=Math.sin(angle)*(dust?radius*.35:4);p.vz=Math.cos(angle)*(dust?radius*.35:4);p.vy=dust?radius*.16:3;
      p.total=p.life=dust?1.8:.45;p.radius=radius;p.dust=dust;made++;
    }
  }
  update(delta:number,camera?:THREE.Camera,pixelHeight=720): void {
    if(camera instanceof THREE.PerspectiveCamera) this.material.uniforms.pixelScale!.value=pixelHeight/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
    for (let i=0;i<this.particles.length;i++) {
      const p=this.particles[i]!,c=i*4,n=i*3;p.life=Math.max(0,p.life-delta);
      const t=1-p.life/p.total;
      p.x+=p.vx*delta;p.y+=p.vy*delta;p.z+=p.vz*delta;
      this.positions[n]=p.x;this.positions[n+1]=p.y;this.positions[n+2]=p.z;
      this.sizes[i]=p.life>0?p.radius*(p.dust?1+t*1.6:1+t):0;
      this.colors[c]=p.dust?.37:1;this.colors[c+1]=p.dust?.32:.56;this.colors[c+2]=p.dust?.27:.12;
      this.colors[c+3]=p.life>0?(p.dust?.62:.8)*(1-Math.exp(-t*10))*(1-t)*(1-t):0;
    }
    for(const name of ['position','tint','size'])this.geometry.getAttribute(name).needsUpdate=true;
  }
  clear(): void {for(const p of this.particles)p.life=0;}
  dispose(): void {this.geometry.dispose();this.material.dispose();}
}

type Fireball = { group:THREE.Group; material:THREE.ShaderMaterial; target:THREE.Vector3;
  direction:THREE.Vector3; id:number|null; smokeTime:number; speed:number };
function createFireball(): Fireball {
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
    uniforms:{time:{value:0},nearFade:{value:1}},
    vertexShader:`varying float vTrail; varying vec3 vNormal;uniform float time;
      void main(){vec3 p=position;float ripple=1.+.035*sin(p.z*.11+time*5.+p.x*.13);
      p.xy*=ripple;vTrail=clamp((p.z+120.)/148.,0.,1.);vNormal=normalMatrix*normal;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`varying float vTrail;varying vec3 vNormal;uniform float nearFade;
      void main(){vec3 c=mix(vec3(.8,.055,.008),vec3(1.,.48,.055),vTrail);
      float a=(.18+.46*vTrail)*nearFade;gl_FragColor=vec4(c,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
  const group=new THREE.Group();group.name='monster-flaming-fireball';group.visible=false;
  const core=new THREE.Mesh(coreGeometry,coreMaterial);core.name='monster-fireball-damaging-core';core.scale.setScalar(22);
  const flame=new THREE.Mesh(flameGeometry,material);flame.name='monster-fireball-flame-trail';
  group.add(core,flame);return {group,material,target:new THREE.Vector3(),direction:new THREE.Vector3(),id:null,smokeTime:0,speed:0};
}

export class MonsterArrivalView {
  private readonly creature: MonsterArrivalModel;
  readonly ready: Promise<void>;
  private readonly pool=Array.from({length:4},()=>createFireball());
  private readonly particles=new MonsterParticles();
  private readonly target=new THREE.Vector3();
  private readonly mouthWorld=new THREE.Vector3();
  private readonly warningMaterial=new THREE.MeshBasicMaterial({color:0xffae3d,transparent:true,opacity:.6,depthWrite:false});
  private readonly mouthFire=new THREE.Mesh(coreGeometry,this.warningMaterial);
  private readonly scene: THREE.Scene;
  private readonly camera?: THREE.Camera;
  private state:MonsterStateMessage|null=null;
  private elapsed=0;
  private lastHitSequence=0;
  private hitPulse=0;
  private ending:'defeat'|'timeout'|null=null;
  private endingElapsed=0;
  private endingDrop?:{from:number;ground:number};
  private timeoutShot?:Fireball;
  private damagedDowntown=false;
  private readonly targetGroundY:number;
  private readonly pixelHeight:()=>number;
  onFootfall?:()=>void;onWarning?:()=>void;onProjectile?:()=>void;onHit?:()=>void;onDestruction?:()=>void;

  constructor(scene:THREE.Scene,terrainY:number,targetGroundY:number,camera?:THREE.Camera,
    source?:Promise<GLTF>,groundAt?:(x:number,z:number)=>number,pixelHeight=()=>720) {
    this.creature=new MonsterArrivalModel(source);this.ready=this.creature.ready;
    this.scene=scene;this.camera=camera;this.targetGroundY=targetGroundY;this.pixelHeight=pixelHeight;
    this.creature.groundAt=groundAt;
    this.creature.root.position.set(journeyDallas19.monster.x,terrainY,journeyDallas19.monster.z);
    this.target.copy(this.creature.root.position);
    this.creature.root.rotation.y=Math.atan2(journeyDallas19.monster.x-journeyDallas19.airborneSpawn.x,
      journeyDallas19.monster.z-journeyDallas19.airborneSpawn.z);
    this.creature.onFootContact=(p)=>{this.particles.emit(p.x,p.y,p.z,true,10,65,1.5);this.onFootfall?.();};
    this.creature.onLanding=(p)=>{this.particles.emit(p.x,p.y,p.z,true,14,95,1.5);this.onFootfall?.();};
    this.mouthFire.name='monster-mouth-warning';this.mouthFire.scale.setScalar(16);this.mouthFire.visible=false;
    // World-space effect: it must never inherit the configured skeletal scale.
    scene.add(this.creature.root,this.mouthFire,this.particles.points,...this.pool.map(p=>p.group));
    void this.ready.catch((error:unknown)=>console.error('Mission 19 creature failed to load',error));
  }
  setState(state:MonsterStateMessage):void {
    if(this.ending)return;
    const oldPhase=this.state?.phase;this.state=state;this.target.set(state.x,state.y,state.z);
    this.creature.setJumpProgress(state.jumpProgress??null);
    this.creature.setMotion(state.velocity?.x??0,state.velocity?.z??0,state.yawVelocity??0,
      state.gaitPhase??0,state.aimYaw??0,state.aimPitch??0);
    if(state.hitSequence>this.lastHitSequence) {
      this.onHit?.();this.hitPulse=.28;this.lastHitSequence=state.hitSequence;this.creature.hit();
      const p=state.hitPosition;this.particles.emit(p?.x??state.x,p?.y??state.y+300,p?.z??state.z,false,5,7);
    }
    if(state.phase==='windup' && oldPhase!=='windup'){this.onWarning?.();this.creature.windup();}
    let released=false;
    for(const visual of this.pool) {
      if(visual.id===null)continue;
      if(!state.shots.some(shot=>shot.id===visual.id)) {
        this.particles.emit(visual.group.position.x,visual.group.position.y,visual.group.position.z,false,8,16);
        visual.id=null;visual.group.visible=false;
      }
    }
    for(const shot of state.shots.slice(0,4)) {
      let visual=this.pool.find(p=>p.id===shot.id);
      if(!visual) {
        visual=this.pool.find(p=>p.id===null);if(!visual)continue;
        visual.id=shot.id;visual.group.visible=true;visual.group.position.set(shot.x,shot.y,shot.z);
        this.onProjectile?.();this.creature.release();released=true;
      }
      visual.target.set(shot.x,shot.y,shot.z);
      visual.direction.set(shot.dx??0,shot.dy??0,shot.dz??-1).normalize();visual.speed=shot.speed??0;
      visual.group.quaternion.setFromUnitVectors(forward,visual.direction);
    }
    if(oldPhase==='windup' && state.phase!=='windup' && !released)this.creature.recover();
  }
  finish(kind:'defeat'|'timeout'):void {
    if(this.ending)return;
    this.ending=kind;this.endingElapsed=0;
    if(this.state?.jumpProgress!==null && this.state?.jumpProgress!==undefined){
      this.endingDrop={from:this.creature.root.position.y,ground:this.creature.groundAt?.(this.creature.root.position.x,this.creature.root.position.z)??this.target.y};
    }
    this.creature.finish(kind);
    for(const visual of this.pool){visual.id=null;visual.group.visible=false;}
    if(kind==='timeout'){this.timeoutShot=this.pool[0];this.timeoutShot!.group.visible=true;}
  }
  update(delta:number):void {
    delta=Math.min(.05,Math.max(0,delta));this.elapsed+=delta;
    const c=this.creature;
    if(this.state && !this.ending) {
      c.root.position.lerp(this.target,1-Math.exp(-delta*12));
      const error=Math.atan2(Math.sin(this.state.yaw-c.root.rotation.y),Math.cos(this.state.yaw-c.root.rotation.y));
      c.root.rotation.y+=error*(1-Math.exp(-delta*12));
    }
    if(this.endingDrop){
      const t=Math.min(1,(this.endingElapsed+delta)/.85);
      c.root.position.y=this.endingDrop.ground+(this.endingDrop.from-this.endingDrop.ground)*(1-t)*(1-t);
      if(t===1)this.endingDrop=undefined;
    }
    this.hitPulse=Math.max(0,this.hitPulse-delta);
    c.update(delta,this.camera?this.camera.position.distanceTo(c.root.position):0,this.hitPulse);
    const windup=this.state?.phase==='windup'&&!this.ending;
    this.mouthFire.visible=Boolean(windup||this.ending==='timeout');
    if(c.mouthPosition(this.mouthWorld))this.mouthFire.position.copy(this.mouthWorld);
    this.mouthFire.scale.setScalar((this.state?.attackKind==='fan'?19:16)*(1+.025*Math.sin(this.elapsed*6)));
    if(this.ending) {
      this.endingElapsed+=delta;
      if(this.ending==='timeout') {
        if(this.timeoutShot) {
          const t=Math.min(1,this.endingElapsed/1.15),p=this.timeoutShot.group.position;
          p.set(THREE.MathUtils.lerp(c.root.position.x,monsterDamageSites[0].x,t),
            THREE.MathUtils.lerp(c.root.position.y+journeyDallas19.monster.height*.82,this.targetGroundY+30,t),
            THREE.MathUtils.lerp(c.root.position.z,monsterDamageSites[0].z,t));
          this.timeoutShot.direction.set(monsterDamageSites[0].x-c.root.position.x,
            this.targetGroundY+30-c.root.position.y-journeyDallas19.monster.height*.82,monsterDamageSites[0].z-c.root.position.z).normalize();
          this.timeoutShot.group.quaternion.setFromUnitVectors(forward,this.timeoutShot.direction);
          if(t===1){this.timeoutShot.group.visible=false;this.timeoutShot=undefined;}
        }
        if(!this.damagedDowntown&&this.endingElapsed>=1.15) {
          this.damagedDowntown=true;setDowntownMonsterDamage(true);this.onDestruction?.();
          for(const site of monsterDamageSites)this.particles.emit(site.x,site.y,site.z,true,8,35);
        }
      }
    }
    for(const visual of this.pool) {
      if(!visual.group.visible)continue;
      if(visual.id!==null) {
        visual.target.addScaledVector(visual.direction,visual.speed*delta);
        visual.group.position.addScaledVector(visual.direction,visual.speed*delta);
        visual.group.position.lerp(visual.target,1-Math.exp(-delta*18));
      }
      visual.material.uniforms.time!.value=this.elapsed;
      visual.material.uniforms.nearFade!.value=this.camera?Math.min(1,this.camera.position.distanceTo(visual.group.position)/35):1;
      visual.smokeTime+=delta;
      if(visual.smokeTime>.12) {
        visual.smokeTime=0;
        const p=visual.group.position,d=visual.direction;
        this.particles.emit(p.x-d.x*90,p.y-d.y*90,p.z-d.z*90,true,1,10);
      }
    }
    this.particles.update(delta,this.camera,this.pixelHeight());
  }
  dispose():void {
    if(this.damagedDowntown)setDowntownMonsterDamage(false);
    this.scene.remove(this.creature.root,this.mouthFire,this.particles.points,...this.pool.map(p=>p.group));
    this.particles.dispose();this.warningMaterial.dispose();
    for(const visual of this.pool)visual.material.dispose();
    this.creature.dispose();this.state=null;
  }
}
