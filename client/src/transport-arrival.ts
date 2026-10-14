import * as THREE from 'three';
import { transportPose, transportTuning } from '../../shared/giant-incoming.mjs';

/** Local briefing before transportReady starts the authoritative encounter. */
export class TransportArrivalSequence {
  private elapsed=0;
  private readonly alert=document.createElement('div');
  private readonly target=new THREE.Vector3();
  private readonly goal=new THREE.Vector3();
  private readonly cameraPosition=new THREE.Vector3();
  private initialized=false;
  private readonly scale=transportTuning.scale/8;
  constructor(private readonly aircraft:THREE.Group,private readonly terrain:(x:number,z:number)=>number){
    this.alert.className='transport-arrival-alert';
    this.alert.setAttribute('role','status');
    this.alert.innerHTML='<span>⚠ DALLAS AIR DEFENSE · RED ALERT</span><strong>GIANT INCOMING</strong><p>Hostile transport approaching Dallas.</p><p>Take off from DFW. Destroy it before it escapes.</p>';
    document.body.append(this.alert);
  }
  get complete():boolean{return this.elapsed>=6;}
  update(delta:number):void{
    this.elapsed=Math.min(6,this.elapsed+delta);
    const pose=transportPose(this.elapsed*1000);
    this.aircraft.position.set(pose.x,Math.max(pose.y,this.terrain(pose.x,pose.z)+350),pose.z);
    this.aircraft.rotation.set(0,pose.yaw,0);this.aircraft.visible=true;
    this.alert.style.opacity=String(Math.min(1,this.elapsed*2,(6-this.elapsed)*2));
  }
  frame(camera:THREE.Camera,delta:number):void{
    const yaw=this.aircraft.rotation.y;
    this.target.copy(this.aircraft.position);
    // Front three-quarter tracking shot, with Dallas along the inbound course behind it.
    this.goal.set(-Math.cos(yaw)*420-Math.sin(yaw)*460,170,Math.sin(yaw)*420-Math.cos(yaw)*460)
      .multiplyScalar(this.scale).add(this.target);
    this.goal.y=Math.max(this.goal.y,this.terrain(this.goal.x,this.goal.z)+120);
    if(!this.initialized){this.cameraPosition.copy(this.goal);this.initialized=true;}
    this.cameraPosition.lerp(this.goal,1-Math.exp(-delta*3));camera.position.copy(this.cameraPosition);
    camera.lookAt(this.target);camera.updateMatrixWorld(true);
  }
  dispose():void{this.alert.remove();}
}
