import * as THREE from 'three';
import {CinematicImpactBlast,cinematicImpactTexture,TRANSPORT_IMPACT_SCALE} from './cinematic-impact';

const IMPACT_SCALE = TRANSPORT_IMPACT_SCALE;

type Puff = { sprite: THREE.Sprite; age: number; duration: number; size: number; velocity: THREE.Vector3 };

/** Short, attempt-owned presentation after authoritative victory; never applies damage. */
export class TransportDefeatSequence {
  private time = 0;
  private smokeClock = 0;
  private impactAt = -1;
  private cursor = 0;
  private ended = false;
  private disposed = false;
  private readonly effects = new THREE.Group();
  private readonly start = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly cameraGoal = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();
  private cameraInitialized = false;
  private readonly framingScale: number;
  private readonly look = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();
  private readonly corners: THREE.Vector3[] = [];
  private readonly sockets: THREE.Object3D[];
  private readonly smokeTexture: THREE.DataTexture;
  private readonly fireTexture: THREE.DataTexture;
  private readonly puffs: Puff[] = [];
  private readonly impactBlast:CinematicImpactBlast;
  private readonly contact = new THREE.Vector3();
  onImpact?: () => void;

  constructor(private readonly scene: THREE.Scene, private readonly aircraft: THREE.Group,
    velocity: {x:number;y:number;z:number}, private readonly terrain: (x:number,z:number)=>number) {
    this.framingScale=Math.max(1,aircraft.scale.x/8);
    this.start.copy(aircraft.position);
    this.forward.set(velocity.x, 0, velocity.z).normalize();
    this.side.set(-this.forward.z, 0, this.forward.x);
    aircraft.updateMatrixWorld(true);
    this.inverse.copy(aircraft.matrixWorld).invert();
    const visibleLevel = aircraft.children.find(child=>child.visible) ?? aircraft;
    visibleLevel.traverse(object=>{
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.computeBoundingBox();
      const bounds=object.geometry.boundingBox;
      if(!bounds)return;
      for(let i=0;i<8;i++)this.corners.push(new THREE.Vector3(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z)
        .applyMatrix4(object.matrixWorld).applyMatrix4(this.inverse));
    });
    this.sockets = [0,1,2,3].map(i=>visibleLevel.getObjectByName(`EngineSmoke_${i}`)).filter((socket):socket is THREE.Object3D=>!!socket);
    this.smokeTexture=cinematicImpactTexture(false);this.fireTexture=cinematicImpactTexture(true);
    for(let i=0;i<48;i++){
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.smokeTexture,color:0x535355,transparent:true,opacity:0,depthWrite:false}));
      sprite.visible=false;this.effects.add(sprite);
      this.puffs.push({sprite,age:0,duration:0,size:0,velocity:new THREE.Vector3()});
    }
    this.impactBlast=new CinematicImpactBlast(IMPACT_SCALE,{fire:this.fireTexture,smoke:this.smokeTexture});
    this.effects.add(this.impactBlast.root);
    scene.add(this.effects);
  }
  get complete(): boolean { return this.ended; }
  get impacted(): boolean { return this.impactAt>=0; }
  private puff(position:THREE.Vector3, dust=false):void{
    const p=this.puffs[this.cursor++%this.puffs.length]!;
    p.sprite.position.copy(position);p.age=0;p.duration=dust?2.2:3.2;p.size=dust?42*IMPACT_SCALE:30;
    p.sprite.material.color.setHex(dust?0x85735f:0x44464a);
    p.sprite.material.rotation=Math.random()*Math.PI*2;p.sprite.visible=true;
    p.velocity.set((Math.random()-.5)*(dust?65*IMPACT_SCALE:14),dust?12*IMPACT_SCALE:22+Math.random()*15,(Math.random()-.5)*(dust?65*IMPACT_SCALE:14));
  }
  update(delta:number):void{
    if(this.ended)return;
    this.time+=delta;
    if(this.impactAt<0){
      const fall=Math.max(0,this.time-.9);
      this.aircraft.position.copy(this.start).addScaledVector(this.forward,Math.max(0,this.time*210-this.time*this.time*3));
      this.aircraft.position.y=this.start.y-12*fall*fall-8*fall;
      this.aircraft.rotation.x=-Math.min(.5,fall*.065);
      this.aircraft.rotation.z=Math.sin(Math.min(fall/4,1)*Math.PI/2)*.23;
      this.aircraft.updateMatrixWorld(true);
      let clearance=Infinity;
      for(const corner of this.corners){
        this.scratch.copy(corner).applyMatrix4(this.aircraft.matrixWorld);
        const height=this.scratch.y-this.terrain(this.scratch.x,this.scratch.z);
        if(height<clearance){clearance=height;this.contact.copy(this.scratch);}
      }
      if(!Number.isFinite(clearance)){clearance=this.aircraft.position.y-this.terrain(this.aircraft.position.x,this.aircraft.position.z);this.contact.copy(this.aircraft.position);}
      if(clearance<=0 || this.time>13){
        this.aircraft.position.y-=clearance;
        this.contact.y=this.terrain(this.contact.x,this.contact.z);
        this.impactAt=this.time;
        for(let i=0;i<24;i++)this.puff(this.contact,true);
        this.onImpact?.();
      }
    }
    this.smokeClock+=delta;
    if(this.smokeClock>=.18){
      this.smokeClock%=.18;
      this.aircraft.updateMatrixWorld(true);
      for(const socket of this.sockets){socket.getWorldPosition(this.scratch);this.puff(this.scratch);}
      if(this.impacted)this.puff(this.contact,true);
    }
    for(const p of this.puffs){
      if(!p.sprite.visible)continue;
      p.age+=delta;const t=p.age/p.duration;
      if(t>=1){p.sprite.visible=false;continue;}
      p.sprite.position.addScaledVector(p.velocity,delta);
      p.sprite.scale.setScalar(p.size*(1+t*3));
      p.sprite.material.opacity=Math.min(1,t*8)*(1-t)*.82;
    }
    if(this.impacted){
      const since=this.time-this.impactAt;
      this.impactBlast.update(since,this.contact);
      if(since>=5.8)this.ended=true;
    }
  }
  frame(camera:THREE.Camera,delta:number):void{
    if(this.ended)return;
    this.look.copy(this.aircraft.position);
    const blastFraming=this.impacted?1-Math.exp(-(this.time-this.impactAt)*1.2):0;
    this.look.y+=15+blastFraming*210*IMPACT_SCALE;
    this.cameraGoal.copy(this.look).addScaledVector(this.side,540*this.framingScale+blastFraming*650*IMPACT_SCALE).addScaledVector(this.forward,-300*this.framingScale-blastFraming*200*IMPACT_SCALE);this.cameraGoal.y+=210*this.framingScale;
    this.cameraGoal.y=Math.max(this.cameraGoal.y,this.terrain(this.cameraGoal.x,this.cameraGoal.z)+90);
    if(!this.cameraInitialized){this.cameraPosition.copy(camera.position);this.cameraInitialized=true;}
    this.cameraPosition.lerp(this.cameraGoal,1-Math.exp(-delta*4));
    camera.position.copy(this.cameraPosition);
    camera.lookAt(this.look);camera.updateMatrixWorld(true);
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    this.ended=true;this.scene.remove(this.effects);
    for(const p of this.puffs)p.sprite.material.dispose();
    this.impactBlast.dispose();
    this.smokeTexture.dispose();this.fireTexture.dispose();this.effects.clear();
  }
}
