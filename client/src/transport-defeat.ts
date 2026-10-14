import * as THREE from 'three';

const IMPACT_SCALE = 3;

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
  private readonly smokeTexture: THREE.CanvasTexture;
  private readonly fireTexture: THREE.CanvasTexture;
  private readonly puffs: Puff[] = [];
  private readonly flash: THREE.Sprite;
  private readonly blast: THREE.Sprite[] = [];
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
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
    this.smokeTexture=this.texture(false);this.fireTexture=this.texture(true);
    for(let i=0;i<48;i++){
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.smokeTexture,color:0x535355,transparent:true,opacity:0,depthWrite:false}));
      sprite.visible=false;this.effects.add(sprite);
      this.puffs.push({sprite,age:0,duration:0,size:0,velocity:new THREE.Vector3()});
    }
    this.flash=new THREE.Sprite(new THREE.SpriteMaterial({map:this.fireTexture,color:0xffffff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
    this.flash.visible=false;this.effects.add(this.flash);
    // Fixed billows form a rising stem and rolling cap, sharing the existing textures.
    for(let i=0;i<18;i++){
      const billow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.fireTexture,color:0xffcc75,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));
      billow.visible=false;this.blast.push(billow);this.effects.add(billow);
    }
    this.ring=new THREE.Mesh(new THREE.RingGeometry(.8,1,48),new THREE.MeshBasicMaterial({color:0xc5aa7f,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
    this.ring.rotation.x=-Math.PI/2;this.ring.visible=false;this.effects.add(this.ring);
    scene.add(this.effects);
  }
  get complete(): boolean { return this.ended; }
  get impacted(): boolean { return this.impactAt>=0; }
  private texture(fire:boolean): THREE.CanvasTexture {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
    const c=canvas.getContext('2d')!;
    const gradient=c.createRadialGradient(48,48,0,48,48,48);
    if(fire){gradient.addColorStop(0,'rgba(255,255,225,1)');gradient.addColorStop(.2,'rgba(255,225,90,1)');gradient.addColorStop(.48,'rgba(255,111,15,.85)');gradient.addColorStop(1,'rgba(135,30,0,0)');}
    else {gradient.addColorStop(0,'rgba(255,255,255,.72)');gradient.addColorStop(.45,'rgba(255,255,255,.5)');gradient.addColorStop(1,'rgba(255,255,255,0)');}
    c.fillStyle=gradient;c.fillRect(0,0,96,96);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
  }
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
        this.flash.position.copy(this.contact).addScaledVector(THREE.Object3D.DEFAULT_UP,45*IMPACT_SCALE);
        this.ring.position.copy(this.contact);this.ring.position.y+=2*IMPACT_SCALE;
        this.flash.visible=this.ring.visible=true;
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
      this.flash.scale.setScalar((160+Math.min(since/.35,1)*740)*IMPACT_SCALE);
      this.flash.material.opacity=Math.max(0,1-since/1.1);
      this.flash.visible=since<1.1;
      this.ring.scale.setScalar((60+since*320)*IMPACT_SCALE);
      this.ring.material.opacity=Math.max(0,.55-since*.18);
      this.ring.visible=since<3.1;
      const rise=1-Math.exp(-since*.8);
      for(let i=0;i<this.blast.length;i++){
        const billow=this.blast[i]!;
        const cap=i>=6, angle=(i-6)*Math.PI/6;
        const radius=(cap?(90+rise*210):Math.sin(i*2.4)*35)*IMPACT_SCALE;
        billow.position.copy(this.contact);
        billow.position.x+=Math.cos(angle)*radius;
        billow.position.z+=Math.sin(angle)*radius;
        billow.position.y+=(cap?110+rise*430+Math.sin(angle*3)*35:45+i*(35+rise*35))*IMPACT_SCALE;
        const size=(cap?100+rise*240:80+rise*95)*IMPACT_SCALE;
        billow.scale.set(size,size*(cap?.85:1.35),1);
        const smoke=since>1.25+i*.025;
        const map=smoke?this.smokeTexture:this.fireTexture;
        if(billow.material.map!==map){billow.material.map=map;billow.material.needsUpdate=true;}
        billow.material.color.setHex(smoke?0x665951:0xffbb62);
        billow.material.opacity=Math.min(1,since*5)*Math.min(1,(5.8-since)/1.6)*.88;
        billow.visible=since<5.8;
      }
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
    for(const billow of this.blast)billow.material.dispose();
    this.flash.material.dispose();this.ring.material.dispose();this.ring.geometry.dispose();
    this.smokeTexture.dispose();this.fireTexture.dispose();this.effects.clear();
  }
}
