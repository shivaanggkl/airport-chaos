import {M24_INTRO} from './m24-intro';
import {M23_INTRO} from './m23-intro';
import {M22_INTRO} from './m22-intro';
import {M21_INTRO} from './m21-intro';
import {M20_INTRO} from './m20-intro';
import {M19_INTRO} from './m19-intro';
import type {ObstacleBounds} from './world';
import {MONSTER_VICTORY_SECONDS} from './monster-victory';
import {MonsterCityBlast,M19_TIMEOUT,M19_CITY_BLAST_SCALE} from './monster-timeout';
import{AshenWarlordModel,mixAshenClipTime}from'./ashen-warlord-model';
import {ashenWarlordModel} from '../../shared/ashen-warlord-model.mjs';
const ashenWarlordHeight=ashenWarlordModel.height;
import {monsterDebrisOffsets} from '../../shared/m19-environment.mjs';
import type {TitanPresentation} from '../../shared/titan-pose.mjs';
import * as THREE from 'three';
import { journeyDallas19 } from '../../shared/journey-mission.mjs';
import { monsterHandSwipe } from '../../shared/monster-hand-swipe.mjs';
import { setDowntownMonsterDamage } from './dallas-skyline';
import { monsterDamageSites } from './osm-city';
import { MonsterArrivalModel,type TitanModelBinding } from './monster-arrival-model';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type MonsterStateMessage = {
  type: 'monsterState'; attemptId: string; x: number; y: number; z: number; yaw: number;
  phase: 'walk' | 'windup'; hitSequence: number; jumpProgress?: number | null;
  velocity?: {x:number;y:number;z:number}; yawVelocity?: number; gaitPhase?: number;
  aimYaw?: number; aimPitch?: number; attackKind?: 'single' | 'fan';
  handSwipe?: { side: 'left' | 'right'; target: {x:number;y:number;z:number}; startedAt: number } | null;
  hitPosition?: { x: number; y: number; z: number };
  shots: { id: number; x: number; y: number; z: number; dx?:number; dy?:number; dz?:number; speed?:number; bornAt?:number }[];
  titan?:TitanPresentation&{destroyedSites?:readonly number[];claimedDebris?:readonly string[];events?:readonly {id:string;kind:string;type:string;position:{x:number;y:number;z:number}}[]};
  serverNow: number;
};

const coreGeometry = new THREE.IcosahedronGeometry(1,2);
const flameGeometry = new THREE.LatheGeometry([
  new THREE.Vector2(0,-120),new THREE.Vector2(4,-105),new THREE.Vector2(12,-60),
  new THREE.Vector2(30,-8),new THREE.Vector2(22,16),new THREE.Vector2(0,28),
],16).rotateX(Math.PI/2);
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
  direction:THREE.Vector3; id:number|string|null; smokeTime:number; speed:number; spawnPending:boolean };
function createFireball(): Fireball {
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
    uniforms:{time:{value:0},nearFade:{value:1}},
    vertexShader:`varying float vTrail; varying vec3 vNormal;varying vec3 vView;uniform float time;
      void main(){vec3 p=position;float ripple=1.+.035*sin(p.z*.11+time*5.+p.x*.13);
      p.xy*=ripple;vTrail=clamp((p.z+120.)/148.,0.,1.);vNormal=normalMatrix*normal;vView=-(modelViewMatrix*vec4(p,1.)).xyz;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`varying float vTrail;varying vec3 vNormal;varying vec3 vView;uniform float nearFade;
      void main(){vec3 c=mix(vec3(.8,.055,.008),vec3(1.,.48,.055),vTrail);
      float edge=pow(abs(dot(normalize(vNormal),normalize(vView))),.65);float pulse=.94+.06*sin(vTrail*18.);float a=(.14+.48*vTrail)*edge*pulse*nearFade;gl_FragColor=vec4(c,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
  const group=new THREE.Group();group.name='monster-flaming-fireball';group.visible=false;
  const core=new THREE.Mesh(coreGeometry,coreMaterial);core.name='monster-fireball-damaging-core';core.scale.setScalar(22);
  const flame=new THREE.Mesh(flameGeometry,material);flame.name='monster-fireball-flame-trail';
  const rock=new THREE.Mesh(new THREE.BoxGeometry(32,28,36),new THREE.MeshStandardMaterial({color:0x68635a,roughness:1}));rock.name='mission-owned-thrown-debris';rock.visible=false;
  group.add(core,flame,rock);return {group,material,target:new THREE.Vector3(),direction:new THREE.Vector3(),id:null,smokeTime:0,speed:0,spawnPending:false};
}

export class MonsterArrivalView {
  private readonly creature: MonsterArrivalModel|AshenWarlordModel;
  private readonly environmentDamage:boolean;
  readonly ready: Promise<void>;
  private readonly pool:Fireball[];
  private readonly particles:MonsterParticles;
  private readonly target=new THREE.Vector3();
  private readonly crimsonCore:boolean;
  private readonly mouthWorld=new THREE.Vector3();
  private readonly warningMaterial=new THREE.MeshBasicMaterial({color:0xffae3d,transparent:true,opacity:.6,depthWrite:false});
  private readonly mouthFire=new THREE.Mesh(coreGeometry,this.warningMaterial);
  private castingHand?:THREE.Mesh;
  private strikingIntroEnabled=false;
  private huntingIntroEnabled=false;
  private showdownIntroEnabled=false;
  private pursuitIntroEnabled=false;
  private finalIntroEnabled=false;
  introFootstepTime=-Infinity;
  private introPunchWarned=false;
  private introPunchImpact=false;
  private introCastingSound=false;
  private introLanded=false;
  private introRoared=false;
  private introReleased=false;
  private readonly introShotOrigin=new THREE.Vector3();
  private readonly introFistWorld=new THREE.Vector3();
  get introFistPosition():THREE.Vector3{return this.introFistWorld;}
  get introProjectilePosition():THREE.Vector3{return this.pool[0]!.group.position;}
  prepareStrikingIntro():void {
    if(!this.striking||this.hunting||this.state)return;
    this.strikingIntroEnabled=true;this.introLanded=false;this.introRoared=false;this.introReleased=false;
    (this.creature as AshenWarlordModel).prepareStrikingIntro();
  }
  prepareHuntingIntro(obstacles:readonly ObstacleBounds[],showdown=false,pursuit=false,final=false):void {
    if(!this.hunting||this.pursuit!==pursuit||this.state)return;
    (this.creature as AshenWarlordModel).prepareHuntingIntro(obstacles,showdown,pursuit,final);
    this.finalIntroEnabled=final;
    this.pursuitIntroEnabled=pursuit;this.introFootstepTime=-Infinity;
    this.showdownIntroEnabled=showdown;this.introPunchImpact=false;this.introCastingSound=false;
    this.strikingIntroEnabled=true;this.huntingIntroEnabled=true;this.introPunchWarned=false;this.introLanded=false;this.introRoared=false;this.introReleased=false;
  }
  private clearStrikingIntro():void {
    if(!this.strikingIntroEnabled)return;
    const shotCount=this.huntingIntroEnabled?3:1;
    this.strikingIntroEnabled=false;this.huntingIntroEnabled=false;this.showdownIntroEnabled=false;this.pursuitIntroEnabled=false;this.finalIntroEnabled=false;this.introFootstepTime=-Infinity;this.mouthFire.visible=false;if(this.castingHand)this.castingHand.visible=false;
    for(let i=0;i<shotCount;i++){
      const shot=this.pool[i]!;shot.group.visible=false;shot.group.scale.setScalar(1);
      (shot.group.children[0] as THREE.Mesh).material=coreMaterial;
    }
    this.particles.clear();
  }
  private updateStrikingIntro():void {
    const timing=this.finalIntroEnabled?M24_INTRO:this.pursuitIntroEnabled?M23_INTRO:this.showdownIntroEnabled?M22_INTRO:this.huntingIntroEnabled?M21_INTRO:M20_INTRO;
    const t=this.introTime!,actor=this.creature as AshenWarlordModel,shot=this.pool[0]!,shotCount=this.huntingIntroEnabled?3:1;
    actor.handPosition('left',this.introFistWorld);
    if(!this.huntingIntroEnabled&&t>=M20_INTRO.land&&!this.introLanded){this.introLanded=true;this.particles.emit(actor.root.position.x,actor.root.position.y,actor.root.position.z,true,14,95,1.5);this.onFootfall?.();}
    if(this.huntingIntroEnabled&&t>=timing.punch&&!this.introPunchWarned){this.introPunchWarned=true;this.onWarning?.();}
    if((this.showdownIntroEnabled||this.pursuitIntroEnabled)&&t>=timing.punch+.55&&!this.introPunchImpact){this.introPunchImpact=true;this.onFootfall?.();}
    if(t>=timing.roar&&!this.introRoared){this.introRoared=true;this.onRoar?.();}
    if((this.showdownIntroEnabled||this.pursuitIntroEnabled)&&t>=timing.cast&&!this.introCastingSound){this.introCastingSound=true;this.onCasting?.();}
    const casting=t>=timing.cast&&t<timing.release;
    this.mouthFire.visible=(!this.huntingIntroEnabled&&t<2)||casting;
    if(!this.huntingIntroEnabled&&t<2){actor.corePosition(this.mouthWorld);this.mouthFire.position.copy(this.mouthWorld);this.mouthFire.scale.setScalar(25+35*THREE.MathUtils.smoothstep(t,0,2));}
    else if(casting){actor.handPosition('right',this.mouthWorld);this.mouthFire.position.copy(this.mouthWorld);this.mouthFire.scale.setScalar(25+55*THREE.MathUtils.smoothstep(t,timing.cast,timing.shoot));}
    if(this.castingHand){this.castingHand.visible=casting;actor.handPosition('left',this.mouthWorld);this.castingHand.position.copy(this.mouthWorld);this.castingHand.scale.setScalar(this.mouthFire.scale.x);}
    if(t>=timing.release&&t<timing.runway&&!this.introReleased){
      this.introReleased=true;actor.handPosition('right',this.introShotOrigin);shot.id=null;shot.spawnPending=false;shot.direction.set(0,1,0);
      // M21–M24 demonstrations follow the firing pose, not a world-up ray.
      // Capture the world direction once so camera tracking cannot steer it.
      if(this.huntingIntroEnabled)shot.direction.set(0,.18,1).applyQuaternion(actor.root.quaternion).normalize();
      for(let i=0;i<shotCount;i++){
        const visual=this.pool[i]!;
        visual.id=null;visual.spawnPending=false;
        // Keep slot zero centered for the existing camera-follow path. The
        // outer rounds use the same ±0.03-radian spread as their existing combat volleys.
        if(i>0){
          const angle=i===1?-.03:.03,c=Math.cos(angle),s=Math.sin(angle),d=shot.direction;
          visual.direction.set(d.x*c+d.z*s,d.y,d.z*c-d.x*s);
        }
        visual.group.quaternion.setFromUnitVectors(forward,visual.direction);
        visual.group.children.forEach((part,index)=>{part.visible=index<2;});
        (visual.group.children[0] as THREE.Mesh).material=this.warningMaterial;
      }
      this.onProjectile?.();
    }
    const age=t-timing.release;
    for(let i=0;i<shotCount;i++){
      const visual=this.pool[i]!;
      visual.group.visible=this.introReleased&&age>=0&&age<1.2;
      if(visual.group.visible){visual.group.position.copy(this.introShotOrigin).addScaledVector(visual.direction,age*ashenWarlordHeight*.9);visual.group.scale.setScalar(1-THREE.MathUtils.smoothstep(age,1,1.2));}
    }
  }
  private readonly scene: THREE.Scene;
  private readonly camera?: THREE.Camera;
  private state:MonsterStateMessage|null=null;
  private renderedTitan?:NonNullable<MonsterStateMessage['titan']>;
  private elapsed=0;
  private readonly beamMaterial=new THREE.MeshBasicMaterial({color:0x66ddff,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending});
  private readonly beamGeometry=new THREE.CylinderGeometry(1,1,1,10);
  private readonly beam=new THREE.Mesh(this.beamGeometry,this.beamMaterial);
  private readonly waveGeometry=new THREE.TorusGeometry(1,.025,4,48);
  private readonly waveMaterial=new THREE.MeshBasicMaterial({color:0xffaa33,transparent:true,opacity:.6,depthWrite:false,side:THREE.DoubleSide});
  private readonly wave=new THREE.Mesh(this.waveGeometry,this.waveMaterial);
  private rubble:THREE.Mesh[]=[];
  private readonly titanEvents=new Set<string>();
  private readonly roarGeometry=new THREE.RingGeometry(.92,1,48,1,-.9,1.8);
  private readonly roar=new THREE.Mesh(this.roarGeometry,this.waveMaterial);

  private swipeAgeMs=0;
  private lastHitSequence=0;
  private hitPulse=0;
  private ending:'defeat'|'timeout'|null=null;
  private endingElapsed=0;
  private endingDrop?:{from:number;ground:number};
  private timeoutShot?:Fireball;
  private timeoutBlast?:MonsterCityBlast;
  private timeoutImpactPlayed=false;
  private readonly endingOrigin=new THREE.Vector3();
  private readonly endingLook=new THREE.Vector3();
  private readonly endingCamera=new THREE.Vector3();
  private readonly endingDestination=new THREE.Vector3();
  static readonly timeoutCinematicMs=M19_TIMEOUT.durationMs;
  get timeoutCinematicActive():boolean{if(this.stationary||this.striking)return this.ending!==null&&this.endingElapsed<(this.ending==='defeat'?MONSTER_VICTORY_SECONDS:M19_TIMEOUT.durationMs/1000);return this.crimsonCore&&this.ending==='timeout'&&this.endingElapsed<M19_TIMEOUT.durationMs/1000;}
  get timeoutBlackoutOpacity():number{
    if(!this.crimsonCore||this.ending!=='timeout')return 0;
    return THREE.MathUtils.smoothstep(this.endingElapsed,M19_TIMEOUT.impactAt+2,M19_TIMEOUT.impactAt+3);
  }
  get timeoutStreamingPosition():THREE.Vector3{return this.endingElapsed<M19_TIMEOUT.releaseAt?this.creature.root.position:this.endingDestination;}
  /** Camera-only aftermath of a server-confirmed M19 timeout. */
  updateTimeoutCamera(camera:THREE.PerspectiveCamera):void {
    if((this.stationary||this.striking)&&this.ending==='defeat'){
      const root=this.creature.root;
      // The supplied model faces local +Z; keep the close shot in front at any combat yaw.
      camera.position.set(0,ashenWarlordHeight*.62,ashenWarlordHeight*.85).applyQuaternion(root.quaternion).add(root.position);
      camera.lookAt(root.position.x,root.position.y+ashenWarlordHeight*.55,root.position.z);return;
    }
    if(!this.crimsonCore||this.ending!=='timeout')return;
    const root=this.creature.root,height=ashenWarlordHeight;
    const t=THREE.MathUtils.smoothstep(this.endingElapsed,M19_TIMEOUT.releaseAt,M19_TIMEOUT.impactAt);
    this.endingLook.copy(this.endingOrigin).lerp(this.endingDestination,t);
    this.endingLook.y+=THREE.MathUtils.smoothstep(this.endingElapsed-M19_TIMEOUT.impactAt,0,1.5)*105*M19_CITY_BLAST_SCALE;
    this.endingCamera.set(height*.8,height*.3,height*1.1).applyAxisAngle(THREE.Object3D.DEFAULT_UP,root.rotation.y).add(this.endingLook);
    const wide=THREE.MathUtils.smoothstep(this.endingElapsed,M19_TIMEOUT.releaseAt,M19_TIMEOUT.impactAt+.4);
    this.mouthWorld.set(this.endingDestination.x+6500,this.endingDestination.y+5500,this.endingDestination.z+9000);
    this.endingCamera.lerp(this.mouthWorld,wide);
    camera.position.copy(this.endingCamera);camera.lookAt(this.endingLook);
  }
  private damagedDowntown=false;
  private readonly targetGroundY:number;
  private readonly pixelHeight:()=>number;
  onEndingComplete?:()=>void;
  onCasting?:()=>void;
  onRoar?:()=>void;onFootfall?:()=>void;onWarning?:()=>void;onProjectile?:()=>void;onHit?:()=>void;onDestruction?:()=>void;

  constructor(scene:THREE.Scene,terrainY:number,targetGroundY:number,camera?:THREE.Camera,
    source?:Promise<GLTF>,groundAt?:(x:number,z:number)=>number,pixelHeight=()=>720,binding?:TitanModelBinding,private readonly stationary=false,private readonly striking=false,private readonly hunting=false,private readonly pursuit=false) {
    this.crimsonCore=Boolean(binding?.url.includes('ashen-warlord'));this.particles=new MonsterParticles(this.crimsonCore?384:96);this.pool=Array.from({length:this.crimsonCore?32:8},()=>createFireball());this.creature=this.crimsonCore?new AshenWarlordModel(source,this.stationary,this.striking,this.hunting,this.pursuit):new MonsterArrivalModel(source,binding);this.environmentDamage=!this.stationary&&!this.striking&&(!binding||!binding.url.includes('armored-apex'));this.ready=this.creature.ready;
    this.scene=scene;this.camera=camera;this.targetGroundY=targetGroundY;this.pixelHeight=pixelHeight;
    this.creature.groundAt=groundAt;
    if(this.crimsonCore){this.beamMaterial.color.set(0xff2340);this.waveMaterial.color.set(0xff3b35);this.warningMaterial.color.set(0xff1735);this.warningMaterial.opacity=.4;}
    if(!this.environmentDamage){this.roarGeometry.dispose();this.roarGeometry=new THREE.RingGeometry(.92,1,48);this.roar.geometry=this.roarGeometry;this.waveMaterial.color.set(0xff3b18);}
    this.creature.root.position.set(journeyDallas19.monster.x,terrainY,journeyDallas19.monster.z);
    if(this.stationary)this.creature.root.rotation.y=Math.atan2(journeyDallas19.airborneSpawn.x-journeyDallas19.monster.x,journeyDallas19.airborneSpawn.z-journeyDallas19.monster.z);
    this.target.copy(this.creature.root.position);
    const facing=this.crimsonCore?-1:1;
    this.creature.root.rotation.y=Math.atan2((journeyDallas19.monster.x-journeyDallas19.airborneSpawn.x)*facing,
      (journeyDallas19.monster.z-journeyDallas19.airborneSpawn.z)*facing);
    this.creature.onFootContact=(p)=>{if(this.pursuitIntroEnabled&&this.introTime!==null)this.introFootstepTime=this.introTime;this.particles.emit(p.x,p.y,p.z,true,10,65,1.5);this.onFootfall?.();};
    this.creature.onLanding=(p)=>{this.particles.emit(p.x,p.y,p.z,true,14,95,1.5);this.onFootfall?.();};
    this.beam.name='titan-authoritative-energy-beam';this.beam.visible=false;this.wave.visible=false;this.roar.visible=false;this.roar.visible=false;
    if(this.striking){this.castingHand=new THREE.Mesh(coreGeometry,this.warningMaterial);this.castingHand.name='m20-left-casting-hand';this.castingHand.visible=false;scene.add(this.castingHand);}
    this.mouthFire.name='monster-mouth-warning';this.mouthFire.scale.setScalar(16);this.mouthFire.visible=false;
    // World-space effect: it must never inherit the configured skeletal scale.
    scene.add(this.creature.root,this.mouthFire,this.particles.points,...this.pool.map(p=>p.group),this.beam,this.wave,this.roar);
    void this.ready.catch((error:unknown)=>console.error('Titan creature failed to load',error));
  }
  setState(state:MonsterStateMessage):void {
    if(this.ending)return;
    this.setIntroTime(null);
    const oldPhase=this.state?.phase,firstTitan=!!state.titan&&!this.state?.titan;
    if(firstTitan){this.creature.root.position.set(state.x,state.y+(state.titan?.poseOffsetY??0),state.z);this.creature.root.rotation.y=state.yaw;}
    this.state=state;
    if(state.titan){this.renderedTitan??=structuredClone(state.titan);this.creature.setTitanPose(this.renderedTitan);this.setTitanState(state);}this.target.set(state.x,state.y+(state.titan?.poseOffsetY??0),state.z);
    this.swipeAgeMs=state.handSwipe ? state.serverNow-state.handSwipe.startedAt : 0;
    this.creature.setJumpProgress(state.jumpProgress??null);
    this.creature.setMotion(state.velocity?.x??0,state.velocity?.z??0,state.yawVelocity??0,
      state.gaitPhase??0,state.aimYaw??0,state.aimPitch??0);
    if(state.hitSequence>this.lastHitSequence) {
      this.onHit?.();this.hitPulse=.28;this.lastHitSequence=state.hitSequence;this.creature.hit();
      const p=state.hitPosition;this.particles.emit(p?.x??state.x,p?.y??state.y+300,p?.z??state.z,false,5,this.crimsonCore?28:7);
    }
    if(state.phase==='windup' && oldPhase!=='windup'){if(this.crimsonCore&&state.titan?.ability?.id==='roaring-shockwave')this.onRoar?.();else this.onWarning?.();if(!state.titan)this.creature.windup();}
    let released=false;
    for(const visual of this.pool) {
      if(visual.id===null)continue;
      if(visual.id!==state.titan?.ability?.heldObject?.id&&!(state.titan?state.titan.projectiles:state.shots).some(shot=>shot.id===visual.id)) {
        if(!String(visual.id).includes(':debris:'))this.particles.emit(visual.group.position.x,visual.group.position.y,visual.group.position.z,false,8,16);
        visual.id=null;visual.group.visible=false;visual.spawnPending=false;
      }
    }
    for(const shot of (state.titan?state.titan.projectiles.map(p=>({id:p.id,x:p.position.x,y:p.position.y,z:p.position.z,dx:p.velocity?.x??0,dy:p.velocity?.y??0,dz:p.velocity?.z??1,speed:p.velocity?Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z):0})):state.shots).slice(0,32)) {
      let visual=this.pool.find(p=>p.id===shot.id);
      if(!visual) {
        visual=this.pool.find(p=>p.id===null);if(!visual)continue;
        visual.id=shot.id;visual.group.visible=true;visual.group.position.set(shot.x,shot.y,shot.z);
        visual.spawnPending=!state.titan;
        this.onProjectile?.();if(!state.titan)this.creature.release();released=true;
      }
      const debris=state.titan?.projectiles.find(p=>p.id===shot.id)?.ability==='debris-throw';
      visual.group.children[0]!.visible=!debris;visual.group.children[1]!.visible=!debris;if(visual.group.children[2])visual.group.children[2]!.visible=!!debris;
      visual.target.set(shot.x,shot.y,shot.z);
      visual.direction.set(shot.dx??0,shot.dy??0,shot.dz??-1).normalize();visual.speed=shot.speed??0;
      visual.group.quaternion.setFromUnitVectors(forward,visual.direction);
    }
    if(oldPhase==='windup' && state.phase!=='windup' && !released)this.creature.recover();
  }
  private setTitanState(state:MonsterStateMessage):void {
    const f=state.titan!,a=f.ability,active=a?.stage==='ACTIVE',warning=a&&['WARNING','WINDUP'].includes(a.stage);
    if(this.environmentDamage&&!this.rubble.length)for(const offset of monsterDebrisOffsets){const source=this.pool[0]!.group.children[2] as THREE.Mesh,rock=new THREE.Mesh(source.geometry,source.material);rock.name='mission-owned-titan-rubble';const x=journeyDallas19.monster.x+offset.x,z=journeyDallas19.monster.z+offset.z;rock.position.set(x,(this.creature.groundAt?.(x,z)??state.y)+22,z);this.rubble.push(rock);this.scene.add(rock);}
    for(let i=0;i<this.rubble.length;i++)this.rubble[i]!.visible=!(f.claimedDebris??[]).some(id=>id.endsWith(`:debris:${i}`));
    if(this.environmentDamage&&f.destroyedSites?.length&&!this.damagedDowntown){this.damagedDowntown=true;setDowntownMonsterDamage(true);this.onDestruction?.();}
    const held=a?.heldObject;if(held){let v=this.pool.find(p=>p.id===held.id)??this.pool.find(p=>p.id===null);if(v){v.id=held.id;v.group.visible=true;v.group.position.set(held.position.x,held.position.y,held.position.z);v.group.children[0]!.visible=false;v.group.children[1]!.visible=false;v.group.children[2]!.visible=true;v.speed=0;v.target.copy(v.group.position);}}
    this.beam.visible=Boolean(a?.id==='energy-beam'&&active);
    if(a?.id==='energy-beam'){
      const length=a.beamLength??6000;this.beam.position.set(a.origin.x+a.direction.x*length/2,a.origin.y+a.direction.y*length/2,a.origin.z+a.direction.z*length/2);
      this.beam.scale.set(24,length,24);this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(a.direction.x,a.direction.y,a.direction.z));
    }
    this.roar.visible=Boolean(a?.id==='roaring-shockwave'&&(active||warning));
    if(a?.id==='roaring-shockwave'){this.roar.position.set(a.origin.x,a.origin.y,a.origin.z);this.roar.scale.setScalar((a.radius??1000)*(active ? .4+.6*a.progress : 1));this.roar.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),f.yaw-Math.PI/2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2));}
    const area=a&&['ground-smash','giant-leap','charging-rampage'].includes(a.id);
    this.wave.visible=Boolean(area&&(active||warning));
    if(area&&a){const radius=a.radius??(a.id==='roaring-shockwave'?1000:a.id==='ground-smash'?450:300);const center=a.landing??(a.id==='ground-smash'?a.origin:f.position);const impact=active&&(!a.landing||a.landed);this.wave.position.set(center.x,(this.creature.groundAt?.(center.x,center.z)??f.position.y)+8,center.z);this.wave.rotation.x=Math.PI/2;this.wave.scale.setScalar(radius*(impact ? .4+.6*a.progress : 1));this.waveMaterial.opacity=impact ? .6*(1-a.progress) : .3;}
    for(const event of f.events??[]){if(this.titanEvents.has(event.id))continue;this.titanEvents.add(event.id);if(this.titanEvents.size>128)this.titanEvents.delete(this.titanEvents.values().next().value!);
      if((this.stationary||this.striking)&&event.kind==='animation'&&event.type==='roar')this.onRoar?.();
      if(this.striking&&event.kind==='animation'&&event.type==='land'){const p=event.position;this.particles.emit(p.x,p.y,p.z,true,14,95,1.5);this.onFootfall?.();}
      if(event.kind==='environment'){if(this.environmentDamage&&event.type==='destroy-approved-block'){this.damagedDowntown=true;setDowntownMonsterDamage(true);this.onDestruction?.();}const p=event.position;this.particles.emit(p.x,p.y,p.z,true,8,event.type==='landing'?160:65);}
    }
  }

  showBulletImpact(hit:{position:{x:number;y:number;z:number};bodyPosition:{x:number;y:number;z:number};yaw:number;sequence:number}):void {
    if(hit.sequence<=this.lastHitSequence)return;
    this.lastHitSequence=hit.sequence;this.hitPulse=.28;this.creature.hit();this.onHit?.();
    // Keep a confirmed surface hit attached to the currently interpolated body.
    this.mouthWorld.set(hit.position.x-hit.bodyPosition.x,hit.position.y-hit.bodyPosition.y,hit.position.z-hit.bodyPosition.z)
      .applyAxisAngle(THREE.Object3D.DEFAULT_UP,this.creature.root.rotation.y-hit.yaw).add(this.creature.root.position);
    const p=this.mouthWorld;
    this.particles.emit(p.x,p.y,p.z,false,8,28);
    this.particles.emit(p.x,p.y,p.z,true,8,100,.18);
  }
  private introOrigin?: {position: THREE.Vector3; yaw: number};
  private introTime: number | null = null;
  private introImpacts = 0;
  private introDamage = false;
  prepareStationaryIntro(obstacles:readonly ObstacleBounds[]):void {
    if(this.stationary)(this.creature as AshenWarlordModel).prepareArrivalIntro(obstacles);
  }
  /** Presentation only: no encounter state, damage, or reward events. */
  setIntroTime(seconds: number | null): void {
    if(seconds===null)this.clearStrikingIntro();
    if(!this.crimsonCore || this.state&&seconds!==null)return;
    if(this.stationary||this.striking){if(this.stationary&&seconds!==null&&seconds>=M19_INTRO.walkEnd&&(this.introTime??0)<M19_INTRO.walkEnd){this.onRoar?.();this.onDestruction?.();}this.introTime=seconds;(this.creature as AshenWarlordModel).setIntroTime(seconds);return;}
    if(seconds!==null&&!this.introOrigin){
      const root=this.creature.root,site=monsterDamageSites[0]!;
      this.introOrigin={position:root.position.clone(),yaw:root.rotation.y};
      // Stage beside the existing destructible downtown block, not miles from the impact.
      root.position.set(site.x-600,this.creature.groundAt?.(site.x-600,site.z-550)??site.y,site.z-550);
      root.rotation.y=Math.atan2(600,550);
    }
    this.introTime=seconds;
    (this.creature as AshenWarlordModel).setIntroTime(seconds);
    if(seconds===null){
      if(this.introDamage)setDowntownMonsterDamage(false);
      this.introDamage=false;this.introImpacts=0;
      if(this.introOrigin){this.creature.root.position.copy(this.introOrigin.position);this.creature.root.rotation.y=this.introOrigin.yaw;this.introOrigin=undefined;}
    }
  }
  get introRoot():THREE.Group {return this.creature.root;}

  finish(kind:'defeat'|'timeout'):void {
    if(this.ending)return;
    this.beam.visible=false;this.wave.visible=false;this.roar.visible=false;
    this.ending=kind;this.endingElapsed=0;
    if(this.state?.titan?.locomotion==='jump'||this.state?.jumpProgress!==null && this.state?.jumpProgress!==undefined){
      this.endingDrop={from:this.creature.root.position.y,ground:this.creature.groundAt?.(this.creature.root.position.x,this.creature.root.position.z)??this.target.y};
    }
    if((this.stationary||this.striking)&&kind==='defeat'){(this.creature as AshenWarlordModel).beginVictory(this.scene);this.onDestruction?.();}
    this.creature.finish(kind);
    if((this.stationary||this.striking)&&kind==='timeout')this.onRoar?.();
    for(const visual of this.pool){visual.id=null;visual.group.visible=false;visual.spawnPending=false;}
    if(kind==='timeout'&&(this.crimsonCore||this.environmentDamage)){
      this.timeoutShot=this.pool[0];this.timeoutShot!.group.visible=!this.crimsonCore;
      this.timeoutShot!.group.children.forEach((part,index)=>{part.visible=index<2;});
      if(this.crimsonCore){this.timeoutBlast=new MonsterCityBlast();this.scene.add(this.timeoutBlast.root);}
      this.endingOrigin.copy(this.creature.root.position).add(new THREE.Vector3(0,this.crimsonCore?ashenWarlordHeight*.6:journeyDallas19.monster.height*.82,0));
      const site=monsterDamageSites[0]!;this.endingDestination.set(site.x,this.targetGroundY+30,site.z);
      if(this.crimsonCore)this.creature.root.rotation.y=Math.atan2(site.x-this.creature.root.position.x,site.z-this.creature.root.position.z);
    }
  }
  update(delta:number):void {
    delta=Math.min(.05,Math.max(0,delta));this.elapsed+=delta;
    const c=this.creature;
    if(this.state && !this.ending) {
      if(this.stationary||this.striking&&!this.hunting)c.root.position.copy(this.target);else c.root.position.lerp(this.target,1-Math.exp(-delta*12));
      if(this.state.titan&&this.renderedTitan){
        const from=this.renderedTitan,to=this.state.titan,w=1-Math.exp(-delta*12),angle=(a:number,b:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*w;
        for(const key of ['feet','limbs']as const)for(const [name,p]of Object.entries(to[key])){const q=from[key][name];if(q){q.x+=(p.x-q.x)*w;q.y+=(p.y-q.y)*w;q.z+=(p.z-q.z)*w;}}
        from.position.x=c.root.position.x;from.position.y=c.root.position.y-(to.poseOffsetY??0);from.position.z=c.root.position.z;
        from.yaw=angle(from.yaw,to.yaw);from.headYaw=angle(from.headYaw,to.headYaw);from.headPitch+=(to.headPitch-from.headPitch)*w;
        if(to.animation){const a=from.animation,b=to.animation;if(a&&a.clip===b.clip&&a.previousClip===b.previousClip){a.time=mixAshenClipTime(a.clip,a.time,b.time,w);a.offsetY+=(b.offsetY-a.offsetY)*w;a.blend+=(b.blend-a.blend)*w;a.previousTime=mixAshenClipTime(b.previousClip??'',a.previousTime??0,b.previousTime??0,w);a.aim=b.aim;if(a.locomotion&&b.locomotion&&a.locomotion.clip===b.locomotion.clip)a.locomotion.time=mixAshenClipTime(b.locomotion.clip,a.locomotion.time,b.locomotion.time,w);else a.locomotion=b.locomotion?{...b.locomotion}:undefined;}else from.animation={...b};}
        from.velocity=to.velocity;from.yawVelocity=to.yawVelocity;from.gait=to.gait;from.gaitRate=to.gaitRate;from.locomotion=to.locomotion;from.ability=to.ability;from.time=to.time;
        c.setTitanPose(from);
      }
      const error=Math.atan2(Math.sin(this.state.yaw-c.root.rotation.y),Math.cos(this.state.yaw-c.root.rotation.y));
      if(this.stationary)c.root.rotation.y=this.state.yaw;else c.root.rotation.y+=error*(1-Math.exp(-delta*12));
    }
    if(this.endingDrop){
      const t=Math.min(1,(this.endingElapsed+delta)/.85);
      c.root.position.y=this.endingDrop.ground+(this.endingDrop.from-this.endingDrop.ground)*(1-t)*(1-t);
      if(t===1)this.endingDrop=undefined;
    }
    this.hitPulse=Math.max(0,this.hitPulse-delta);
    if(this.state?.handSwipe && !this.ending) {
      this.swipeAgeMs += delta*1000;
      c.setHandSwipe({side:this.state.handSwipe.side,target:this.state.handSwipe.target,
        progress:this.swipeAgeMs/monsterHandSwipe.durationMs});
    } else c.setHandSwipe(null);
    c.update(delta,this.camera?this.camera.position.distanceTo(c.root.position):0,this.hitPulse);
    if(!this.stationary&&!this.striking&&this.introTime!==null&&!this.state&&!this.ending){
      const impacts=this.introTime>=3.8?2:this.introTime>=1.55?1:0;
      if(impacts>this.introImpacts){
        this.introImpacts=impacts;
        // Use the animated fist for contact dust, and existing reversible city debris.
        if((c as AshenWarlordModel).handPosition('right',this.mouthWorld))
          this.particles.emit(this.mouthWorld.x,this.mouthWorld.y,this.mouthWorld.z,true,96,170,2);
        for(const site of monsterDamageSites)
          this.particles.emit(site.x,site.y+30,site.z,true,40,100,2);
        this.introDamage=true;setDowntownMonsterDamage(true);this.onDestruction?.();
      }
    }
    const windup=this.state?.phase==='windup'&&!this.ending;
    const power=this.state?.titan?.ability?.id;
    this.mouthFire.visible=Boolean((windup&&(!this.state?.titan||['energy-beam','fireball-barrage','roaring-shockwave'].includes(power??'')))||this.environmentDamage&&!this.crimsonCore&&this.ending==='timeout');
    if(this.striking){
      const ability=this.renderedTitan?.ability;
      this.mouthFire.visible=!this.ending&&ability?.id==='fireball-barrage'&&ability.stage==='WARNING';
      if((c as AshenWarlordModel).handPosition('right',this.mouthWorld))this.mouthFire.position.copy(this.mouthWorld);
      if(this.castingHand){
        this.castingHand.visible=this.mouthFire.visible;
        if((c as AshenWarlordModel).handPosition('left',this.mouthWorld))this.castingHand.position.copy(this.mouthWorld);
        this.castingHand.scale.setScalar(25+50*(ability?.progress??0));
      }
    }
    const mouthAvailable=!this.striking&&c.mouthPosition(this.mouthWorld);
    if(!this.striking&&this.crimsonCore&&this.renderedTitan?.ability&&['energy-beam','fireball-barrage'].includes(power??'')){const p=this.renderedTitan.ability.origin;this.mouthFire.position.set(p.x,p.y,p.z);}else if(mouthAvailable)this.mouthFire.position.copy(this.mouthWorld);
    this.mouthFire.scale.setScalar((this.striking?25+50*(this.renderedTitan?.ability?.progress??0):this.state?.attackKind==='fan'?19:16)*(1+.025*Math.sin(this.elapsed*6)));
    if(this.strikingIntroEnabled&&this.introTime!==null&&!this.state&&!this.ending)this.updateStrikingIntro();
    if(this.ending) {
      this.endingElapsed+=delta;
      if((this.stationary||this.striking)&&this.endingElapsed>=(this.ending==='defeat'?MONSTER_VICTORY_SECONDS:M19_TIMEOUT.durationMs/1000)&&this.onEndingComplete){const complete=this.onEndingComplete;this.onEndingComplete=undefined;complete();}
      if(this.ending==='timeout'&&(this.crimsonCore||this.environmentDamage)) {
        const release=this.crimsonCore?M19_TIMEOUT.releaseAt:0,travel=this.crimsonCore?M19_TIMEOUT.impactAt-M19_TIMEOUT.releaseAt:1.15;
        if(this.timeoutShot&&this.endingElapsed>=release) {
          if(this.crimsonCore&&!this.timeoutShot.group.visible){
            // Capture the actual animated firing hand at the release frame.
            (c as AshenWarlordModel).handPosition('right',this.endingOrigin);
            this.onProjectile?.();
          }
          this.timeoutShot.group.visible=true;
          const t=Math.min(1,(this.endingElapsed-release)/travel),p=this.timeoutShot.group.position;
          p.set(THREE.MathUtils.lerp(this.endingOrigin.x,monsterDamageSites[0].x,t),
            THREE.MathUtils.lerp(this.endingOrigin.y,this.targetGroundY+30,t),
            THREE.MathUtils.lerp(this.endingOrigin.z,monsterDamageSites[0].z,t));
          this.timeoutShot.direction.set(monsterDamageSites[0].x-c.root.position.x,
            this.targetGroundY+30-this.endingOrigin.y,monsterDamageSites[0].z-c.root.position.z).normalize();
          this.timeoutShot.group.quaternion.setFromUnitVectors(forward,this.timeoutShot.direction);
          if(t===1){this.timeoutShot.group.visible=false;this.timeoutShot=undefined;}
        }
        if((!this.damagedDowntown||this.crimsonCore&&!this.timeoutImpactPlayed)&&this.endingElapsed>=release+travel) {
          this.timeoutImpactPlayed=true;this.damagedDowntown=true;setDowntownMonsterDamage(true);this.onDestruction?.();
          for(const site of monsterDamageSites)this.particles.emit(site.x,site.y,site.z,true,this.crimsonCore?24:8,this.crimsonCore?950:35,2);

        }
      }
    }
    this.timeoutBlast?.update(this.endingElapsed-M19_TIMEOUT.impactAt,this.endingDestination);
    for(const visual of this.pool) {
      if(!visual.group.visible)continue;
      if(visual.spawnPending){
        if(!this.state?.titan&&mouthAvailable)visual.group.position.copy(this.mouthWorld);
        visual.spawnPending=false;
      }
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
    this.setIntroTime(null);
    this.timeoutBlast?.dispose();this.timeoutBlast=undefined;
    this.scene.remove(...this.rubble);this.rubble=[];
    this.scene.remove(this.beam,this.wave,this.roar);this.roarGeometry.dispose();this.titanEvents.clear();this.beamGeometry.dispose();this.beamMaterial.dispose();this.waveGeometry.dispose();this.waveMaterial.dispose();
    if(this.damagedDowntown)setDowntownMonsterDamage(false);
    this.scene.remove(this.creature.root,this.mouthFire,this.particles.points,...this.pool.map(p=>p.group));
    this.castingHand?.removeFromParent();this.castingHand=undefined;
    this.particles.dispose();this.warningMaterial.dispose();
    for(const visual of this.pool){visual.material.dispose();const rock=visual.group.children[2] as THREE.Mesh;rock.geometry.dispose();(rock.material as THREE.Material).dispose();}
    this.onEndingComplete=undefined;this.creature.dispose();this.state=null;this.renderedTitan=undefined;
  }
}
