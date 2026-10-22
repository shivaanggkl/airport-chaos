import * as THREE from 'three';
import { transportFootprintRadius, transportPose, transportTuning } from '../../shared/giant-incoming.mjs';

/** Local briefing before transportReady starts the authoritative encounter. */
export class TransportArrivalSequence {
  private static readonly giantShotSeconds=6;
  private static readonly runwayTravelSeconds=2.5;
  private static readonly runwayOrbitSeconds=2;
  private static readonly totalSeconds=TransportArrivalSequence.giantShotSeconds
    +TransportArrivalSequence.runwayTravelSeconds+TransportArrivalSequence.runwayOrbitSeconds;
  private elapsed=0;
  private readonly alert=document.createElement('div');
  private readonly target=new THREE.Vector3();
  private readonly goal=new THREE.Vector3();
  private readonly cameraPosition=new THREE.Vector3();
  private readonly handoffPosition=new THREE.Vector3();
  private readonly handoffTarget=new THREE.Vector3();
  private readonly runwayPosition=new THREE.Vector3();
  private readonly runwayTarget=new THREE.Vector3();
  private initialized=false;
  private handoffStarted=false;
  private readonly scale=transportTuning.scale/8;
  constructor(private readonly aircraft:THREE.Group,private readonly terrain:(x:number,z:number)=>number,
    private readonly scene:THREE.Scene,private readonly escorts:readonly THREE.Group[]=[], missionName?: string){
    this.alert.className='transport-arrival-alert';
    this.alert.setAttribute('role','status');
    this.alert.innerHTML=escorts.length
      ? `<span>⚠ DALLAS ALERT</span><strong>${missionName === 'CROSSFIRE' ? 'CROSSFIRE' : missionName === 'REINFORCEMENTS' ? 'REINFORCEMENTS' : 'REAR GUARD'}</strong><p>Destroy the ${missionName === 'CROSSFIRE' ? 'gunship' : 'transport'} to win. Escorts are optional.</p>`
      : '<span>⚠ DALLAS ALERT</span><strong>GIANT INCOMING</strong><p>Destroy the transport before it escapes.</p>';
    document.body.append(this.alert);
    this.scene.add(...escorts);
  }
  get complete():boolean{return this.elapsed>=TransportArrivalSequence.totalSeconds;}
  get showsPlayer():boolean{return this.elapsed>=TransportArrivalSequence.giantShotSeconds
    +TransportArrivalSequence.runwayTravelSeconds*.75;}
  skip():void{this.elapsed=TransportArrivalSequence.totalSeconds;}
  update(delta:number):void{
    this.elapsed=Math.min(TransportArrivalSequence.totalSeconds,this.elapsed+delta);
    const pose=transportPose(this.elapsed*1000);
    this.aircraft.position.set(pose.x,Math.max(pose.y,this.terrain(pose.x,pose.z)+350),pose.z);
    this.aircraft.rotation.set(0,pose.yaw,0);this.aircraft.visible=true;
    const sideX=Math.cos(pose.yaw),sideZ=-Math.sin(pose.yaw);
    const forwardX=-Math.sin(pose.yaw),forwardZ=-Math.cos(pose.yaw);
    this.escorts.forEach((escort,index)=>{
      const side=index===0?-1:1;
      const lateral=side*(transportFootprintRadius+180+Math.sin(this.elapsed*1.2+index*2)*12);
      const ahead=200+Math.sin(this.elapsed*.9+index)*20;
      escort.position.set(this.aircraft.position.x+sideX*lateral+forwardX*ahead,
        this.aircraft.position.y+50+Math.sin(this.elapsed*1.4+index)*10,
        this.aircraft.position.z+sideZ*lateral+forwardZ*ahead);
      escort.rotation.set(0,pose.yaw,side*.1);
      escort.visible=this.elapsed<TransportArrivalSequence.giantShotSeconds;
    });
    this.alert.style.opacity=String(Math.min(1,this.elapsed*2,
      (TransportArrivalSequence.giantShotSeconds-this.elapsed)*2));
  }
  frame(camera:THREE.Camera,delta:number,player:THREE.Object3D,
    chasePosition:THREE.Vector3,chaseTarget:THREE.Vector3):void{
    if(this.elapsed<TransportArrivalSequence.giantShotSeconds){
      const yaw=this.aircraft.rotation.y;
      this.target.copy(this.aircraft.position);
      if(this.escorts.length){
        // Frame both fighters beyond the transport's wings, clear of its body.
        this.goal.set(-Math.sin(yaw)*550+Math.cos(yaw)*75,125,
          -Math.cos(yaw)*550-Math.sin(yaw)*75).multiplyScalar(this.scale).add(this.target);
      }else{
        // Preserve Mission 7's front three-quarter tracking shot.
        this.goal.set(-Math.cos(yaw)*420-Math.sin(yaw)*460,170,
          Math.sin(yaw)*420-Math.cos(yaw)*460).multiplyScalar(this.scale).add(this.target);
      }
      this.goal.y=Math.max(this.goal.y,this.terrain(this.goal.x,this.goal.z)+120);
      if(!this.initialized){this.cameraPosition.copy(this.goal);this.initialized=true;}
      this.cameraPosition.lerp(this.goal,1-Math.exp(-delta*3));camera.position.copy(this.cameraPosition);
      camera.lookAt(this.target);camera.updateMatrixWorld(true);
      return;
    }
    if(!this.handoffStarted){
      this.handoffPosition.copy(this.cameraPosition);
      this.handoffTarget.copy(this.target);
      this.handoffStarted=true;
    }
    const radius=Math.max(12,chasePosition.distanceTo(player.position)*1.3);
    const previewAngle=2.15;
    const previewHeight=Math.max(5,radius*.55);
    this.runwayPosition.set(Math.sin(previewAngle)*radius,previewHeight,
      Math.cos(previewAngle)*radius).applyQuaternion(player.quaternion).add(player.position);
    this.runwayPosition.y=Math.max(this.runwayPosition.y,
      this.terrain(this.runwayPosition.x,this.runwayPosition.z)+2.2);
    this.runwayTarget.copy(player.position);
    this.runwayTarget.y+=1.2;
    const travel=THREE.MathUtils.clamp((this.elapsed-TransportArrivalSequence.giantShotSeconds)
      /TransportArrivalSequence.runwayTravelSeconds,0,1);
    if(travel<1){
      const eased=travel*travel*(3-2*travel);
      camera.position.lerpVectors(this.handoffPosition,this.runwayPosition,eased);
      camera.position.y+=Math.sin(Math.PI*eased)
        *Math.min(250,this.handoffPosition.distanceTo(this.runwayPosition)*.06);
      this.target.lerpVectors(this.handoffTarget,this.runwayTarget,eased);
    }else{
      const orbit=THREE.MathUtils.clamp((this.elapsed-TransportArrivalSequence.giantShotSeconds
        -TransportArrivalSequence.runwayTravelSeconds)/TransportArrivalSequence.runwayOrbitSeconds,0,1);
      const eased=orbit*orbit*(3-2*orbit);
      const angle=previewAngle*(1-eased);
      const chaseRadius=chasePosition.distanceTo(player.position);
      const orbitRadius=THREE.MathUtils.lerp(radius,chaseRadius,eased);
      this.goal.set(Math.sin(angle)*orbitRadius,
        THREE.MathUtils.lerp(previewHeight,chasePosition.y-player.position.y,eased),
        Math.cos(angle)*orbitRadius).applyQuaternion(player.quaternion).add(player.position);
      this.goal.lerp(chasePosition,THREE.MathUtils.smoothstep(orbit,.8,1));
      camera.position.copy(this.goal);
      this.target.lerpVectors(this.runwayTarget,chaseTarget,eased);
    }
    camera.position.y=Math.max(camera.position.y,this.terrain(camera.position.x,camera.position.z)+2.2);
    camera.lookAt(this.target);camera.updateMatrixWorld(true);
  }
  dispose():void{this.alert.remove();this.scene.remove(...this.escorts);}
}
